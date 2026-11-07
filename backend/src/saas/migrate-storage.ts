/** Offline AWS S3 -> AWS S3 / S3-compatible copy with per-object SHA256 verification. */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {Readable, PassThrough, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {MongoClient,ObjectId} from 'mongodb';
import {MIGRATION_CONFIRM, eligibleForExecution} from './migration-policy.js';

const apply=process.argv.includes('--apply');
const verifyOnly=process.argv.includes('--verify');
const planId=process.argv.find(x=>x.startsWith('--plan-id='))?.split('=')[1];
const required=(name:string)=>{const value=(process.env[name]||'').trim();if(!value)throw new Error(`${name} required`);return value;};
const sourceBucket=required('STORAGE_MIGRATION_SOURCE_BUCKET');
const destBucket=required('STORAGE_MIGRATION_TARGET_BUCKET');
const sourceEndpoint=process.env.STORAGE_MIGRATION_SOURCE_ENDPOINT||'';
const destEndpoint=process.env.STORAGE_MIGRATION_TARGET_ENDPOINT||'';
const prefix=process.env.STORAGE_MIGRATION_PREFIX||''; // Empty means the ENTIRE source bucket.
const sRegion=process.env.STORAGE_MIGRATION_SOURCE_REGION||'ap-south-1';
const dRegion=process.env.STORAGE_MIGRATION_TARGET_REGION||'ap-south-1';
if(sourceBucket===destBucket&&sourceEndpoint===destEndpoint&&sRegion===dRegion)throw new Error('Same source/destination storage location');
if((apply||verifyOnly)&&!planId)throw new Error('An approved --plan-id is required');
if(apply&&process.env.STORAGE_MIGRATION_CONFIRM!==MIGRATION_CONFIRM)throw new Error('Missing STORAGE_MIGRATION_CONFIRM safety phrase');
const makeClient=(p:'SOURCE'|'TARGET', region:string,endpoint:string)=>{
  const id=process.env[`STORAGE_MIGRATION_${p}_ACCESS_KEY_ID`];
  const secret=process.env[`STORAGE_MIGRATION_${p}_SECRET_ACCESS_KEY`];
  if(Boolean(id)!==Boolean(secret))throw new Error(`Both ${p} credentials must be set together`);
  return new S3Client({region,...(endpoint?{endpoint}:{}),
    forcePathStyle:process.env[`STORAGE_MIGRATION_${p}_PATH_STYLE`]==='true',
    ...(id&&secret?{credentials:{accessKeyId:id,secretAccessKey:secret}}:{})});
};
const src=makeClient('SOURCE',sRegion,sourceEndpoint),dst=makeClient('TARGET',dRegion,destEndpoint);
async function sha(client:S3Client,bucket:string,key:string):Promise<string>{
  const obj=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(!obj.Body)throw new Error(`Missing object body: ${key}`);
  const h=crypto.createHash('sha256');
  for await(const chunk of obj.Body as any as AsyncIterable<Uint8Array>)h.update(chunk);
  return h.digest('hex');
}
async function hasObject(client:S3Client,bucket:string,key:string):Promise<boolean>{
  try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));return true;}
  catch(e:any){if(e?.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey'].includes(e?.name))return false;throw e;}
}
async function copyAndVerify(key:string){
  const sourceHash=crypto.createHash('sha256');
  const exists=await hasObject(dst,destBucket,key);
  if(!exists){
    const get=await src.send(new GetObjectCommand({Bucket:sourceBucket,Key:key}));
    if(!get.Body)throw new Error('Object body missing');
    const stream=new PassThrough();
    const transform=new Transform({transform(chunk,_,callback){sourceHash.update(chunk);callback(null,chunk);}});
    const upload=new Upload({client:dst,params:{Bucket:destBucket,Key:key,Body:stream,
      ContentType:get.ContentType,CacheControl:get.CacheControl,ContentDisposition:get.ContentDisposition,
      Metadata:get.Metadata},partSize:8*1024*1024,queueSize:2,leavePartsOnError:false});
    await Promise.all([pipeline(get.Body as any as Readable,transform,stream),upload.done()]);
  } else {
    const original=await src.send(new GetObjectCommand({Bucket:sourceBucket,Key:key}));
    if(!original.Body)throw new Error('Missing source object');
    for await(const chunk of original.Body as any as AsyncIterable<Uint8Array>)sourceHash.update(chunk);
  }
  const expected=sourceHash.digest('hex');
  const actual=await sha(dst,destBucket,key);
  if(expected!==actual)throw new Error(`SHA256 differs for ${key}; target must not be activated`);
  return {key,sha256:expected,verified:true,existingAtDestination:exists};
}
async function run(){
  let db:MongoClient|undefined;
  let plan:any;
  try{
    if(apply||verifyOnly){
      db=new MongoClient(required('MONGODB_URI'));await db.connect();
      plan=await db.db().collection('platformmigrations').findOne({_id:new ObjectId(planId)});
      if(!plan||plan.kind!=='storage'||!(eligibleForExecution(plan)||(verifyOnly&&plan.status==='verified')))
        throw new Error('Requires approved two-person storage migration plan');
    }
    let token:string|undefined;let count=0;let bytes=0;
    const cap=Math.max(1,Number(process.env.STORAGE_MIGRATION_MAX_OBJECTS||100000));
    const manifest:any[]=[];
    do{
      const page=await src.send(new ListObjectsV2Command({Bucket:sourceBucket,Prefix:prefix,ContinuationToken:token,MaxKeys:1000}));
      for(const item of page.Contents||[]){
        if(!item.Key)continue;
        count++;if(count>cap)throw new Error(`Exceeded STORAGE_MIGRATION_MAX_OBJECTS=${cap}; use a reviewed scalable migration runner`);bytes+=item.Size||0;
        if(apply)manifest.push(await copyAndVerify(item.Key));
        if(verifyOnly){
          const [a,b]=await Promise.all([sha(src,sourceBucket,item.Key),sha(dst,destBucket,item.Key)]);
          if(a!==b)throw new Error(`Verification mismatch: ${item.Key}`);
          manifest.push({key:item.Key,sha256:a,verified:true});
        }
      }
      token=page.NextContinuationToken;
    }while(token);
    if(!count)throw new Error('No source objects found under specified prefix');
    if(apply||verifyOnly){
      let destCount=0;let dt:string|undefined;
      do{const page=await dst.send(new ListObjectsV2Command({Bucket:destBucket,Prefix:prefix,ContinuationToken:dt,MaxKeys:1000}));
        destCount+=(page.Contents||[]).filter(o=>!!o.Key).length;dt=page.NextContinuationToken;}while(dt);
      if(destCount!==count)throw new Error(`Destination has ${destCount} objects, source ${count}; extra or missing objects require review`);
    }
    console.log(`${apply?'Copied and verified':verifyOnly?'Verified':'Dry run'} ${count} objects / ${bytes} bytes. Source objects preserved.`);
    const report={kind:'storage',sourceBucket,targetBucket:destBucket,sourcePrefix:prefix,objects:count,bytes,
      verified:apply||verifyOnly,finishedAt:new Date().toISOString(),manifest};
    if(apply||verifyOnly){
      const out=process.env.STORAGE_MIGRATION_REPORT_PATH||'storage-migration-report.json';
      await fs.writeFile(out,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
      console.log(`Manifest written to ${out}. Store securely with backup evidence.`);
      if(apply&&db){
        await db.db().collection('platformmigrations').updateOne({_id:plan._id,status:'approved'},
          {$set:{status:'verified',finishedAt:new Date(),report:{objects:count,bytes,verified:true}}});
      }
    } else console.log('Dry run only. Obtain independent Platform Owner approval, freeze writes, and use --apply --plan-id=<id>.');
  }finally{if(db)await db.close();src.destroy();dst.destroy();}
}
try{await run();}catch(e){console.error('Storage migration aborted:',(e as Error).message);process.exitCode=1;}
