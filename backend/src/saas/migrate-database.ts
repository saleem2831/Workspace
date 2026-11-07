/**
 * Offline whole-database clone. Requires source writes stopped, an empty target,
 * two-person platform authorization, and an independent verified backup.
 * NEVER automatically switches the application's MONGODB_URI.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { EJSON } from 'bson';
import { MIGRATION_CONFIRM, eligibleForExecution } from './migration-policy.js';

const apply=process.argv.includes('--apply');
const verifyOnly=process.argv.includes('--verify');
const planId=process.argv.find(v=>v.startsWith('--plan-id='))?.split('=')[1];
const sourceUri=process.env.MONGODB_URI||'';
const targetUri=process.env.DB_MIGRATION_TARGET_URI||'';
if(!sourceUri||!targetUri)throw new Error('MONGODB_URI and DB_MIGRATION_TARGET_URI required; never pass URI in command-line args');
if(sourceUri===targetUri)throw new Error('Source and destination URI are identical');
if((apply||verifyOnly)&&!planId)throw new Error('--plan-id=<approved plan ID> is required');
if(apply&&process.env.DB_MIGRATION_CONFIRM!==MIGRATION_CONFIRM)throw new Error('Missing DB_MIGRATION_CONFIRM safety phrase');
const source=new MongoClient(sourceUri,{maxPoolSize:3});
const dest=new MongoClient(targetUri,{maxPoolSize:3});

const digest=async(db:Db,name:string)=>{
  const hash=crypto.createHash('sha256');let count=0;
  for await (const doc of db.collection(name).find({}).sort({_id:1}).batchSize(200)) {
    hash.update(EJSON.stringify(doc,{relaxed:false}));hash.update('\n');count++;
  }
  return {count,sha256:hash.digest('hex')};
};

async function run(){
  await Promise.all([source.connect(),dest.connect()]);
  const src=source.db(),dst=dest.db();
  if(src.databaseName==='test'||dst.databaseName==='test')throw new Error('Connection strings must name explicit non-test databases');
  const collections=await src.listCollections().toArray();
  if(collections.some(c=>c.type!=='collection'))throw new Error('Database contains views or unsupported namespaces; use a reviewed mongodump/mongorestore playbook');
  const names=collections.filter(c=>!c.name.startsWith('system.')).map(c=>c.name);
  if(!names.length)throw new Error('Source database has no collections');
  // Same logical DB detection: inserting into an already populated target is always refused.
  const existing=(await dst.listCollections().toArray()).filter(x=>!x.name.startsWith('system.'));
  if(apply&&existing.length)throw new Error('Destination database must be empty; restore to a fresh database instead of overwriting');
  const control=src.collection('platformmigrations');
  let plan:any;
  if(apply||verifyOnly){
    plan=await control.findOne({_id:new (await import('mongodb')).ObjectId(planId)});
    if(!plan || plan.kind!=='database' || !eligibleForExecution(plan)) {
      // A verified plan is acceptable for a later verification run.
      if(!(verifyOnly&&plan?.status==='verified'&&plan?.kind==='database'))
        throw new Error('No approved two-person database migration plan');
    }
  }
  const report:any={kind:'database',sourceDb:src.databaseName,targetDb:dst.databaseName,
    collections:[] as any[],sourceCollectionCount:names.length,startedAt:new Date().toISOString()};
  console.log(`${apply?'APPLY':verifyOnly?'VERIFY':'DRY RUN'}: ${names.length} collections; source ${src.databaseName} -> destination ${dst.databaseName}`);
  for(const info of collections.filter(c=>names.includes(c.name))){
    const name=info.name;
    const count=await src.collection(name).countDocuments();
    const indexes=await src.collection(name).listIndexes().toArray();
    const summary:any={collection:name,sourceCount:count,indexes:indexes.length};
    if(apply){
      const options=('options' in info && info.options) ? info.options : {};
      await dst.createCollection(name,options as any);
      const target=dst.collection(name);
      const docs:any[]=[];
      for await(const doc of src.collection(name).find({}).sort({_id:1}).batchSize(200)){
        docs.push(doc);
        if(docs.length>=200){await target.insertMany(docs,{ordered:true});docs.length=0;}
      }
      if(docs.length)await target.insertMany(docs,{ordered:true});
      const custom=indexes.filter(i=>i.name!=='_id_').map(i=>{
        const {v,ns,background,...rest}=i as any;return rest;
      });
      if(custom.length)await target.createIndexes(custom as any);
    }
    if(apply||verifyOnly){
      const [a,b]=await Promise.all([digest(src,name),digest(dst,name)]);
      summary.targetCount=b.count;summary.sourceSha256=a.sha256;summary.targetSha256=b.sha256;
      if(a.count!==b.count||a.sha256!==b.sha256)throw new Error(`Verification failed for ${name}; source kept unchanged`);
      const targetIndexes=await dst.collection(name).listIndexes().toArray();
      if(indexes.length!==targetIndexes.length)throw new Error(`Index count mismatch for ${name}`);
      summary.verified=true;
    }
    report.collections.push(summary);
    console.log(`${name}: ${count} records, ${indexes.length} indexes${summary.verified?' - verified':''}`);
  }
  report.finishedAt=new Date().toISOString();
  if(apply){
    const id=plan._id;
    const changes={$set:{status:'verified',finishedAt:new Date(),report:{collections:report.collections.map((c:any)=>({collection:c.collection,count:c.sourceCount,indexes:c.indexes,verified:c.verified})),verifiedAt:report.finishedAt}}};
    await src.collection('platformmigrations').updateOne({_id:id,status:'approved'},changes);
    await dst.collection('platformmigrations').updateOne({_id:id},changes);
    console.log('SOURCE AND DESTINATION VERIFIED. Do not switch MONGODB_URI until application smoke tests and restoration checks pass.');
  }else if(!verifyOnly){
    console.log('Dry run only. Back up DB, stop application writes, obtain second Platform Owner approval, then run --apply --plan-id=<id>.');
  }
}
try{await run();}catch(e){console.error('Migration aborted:',(e as Error).message);process.exitCode=1;}
finally{await Promise.allSettled([source.close(),dest.close()]);}
