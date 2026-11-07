import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Enabled = process.env.STORAGE_BACKEND === 's3';
const bucket = process.env.S3_BUCKET || '';
const region = process.env.AWS_REGION || 'ap-south-1';
const client = new S3Client({ region,
  ...(process.env.S3_ENDPOINT_URL ? {endpoint:process.env.S3_ENDPOINT_URL}:{}),
  forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true' }); // credentials via IAM role / environment, never in client bundle
if (s3Enabled && !bucket) throw new Error('S3_BUCKET required when STORAGE_BACKEND=s3');
export const storageMode = () => s3Enabled ? 's3' : 'local';
export const sha256 = (bytes:Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
export function objectKey(tenantId:string,companyId:string,purpose:string) {
  if (![tenantId,companyId].every(v=>/^[0-9a-f]{24}$/i.test(v))) throw new Error('Invalid storage scope');
  const safePurpose=purpose.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
  return `tenants/${tenantId}/companies/${companyId}/${safePurpose}/${crypto.randomUUID()}`;
}
export async function putPrivate(tenantId:string,companyId:string,purpose:string,bytes:Buffer,mime:string) {
  const hash=sha256(bytes);
  if (s3Enabled) {
    const key=objectKey(tenantId,companyId,purpose);
    const encryption=process.env.S3_KMS_KEY_ID;
    // S3-compatible providers may not accept AWS SSE headers; provider encryption is managed in the bucket.
    const sse=encryption?'aws:kms':(process.env.S3_SERVER_SIDE_ENCRYPTION || (process.env.S3_ENDPOINT_URL?'':'AES256'));
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:mime,
      ...(sse?{ServerSideEncryption:sse as any}:{}),
      ...(encryption?{SSEKMSKeyId:encryption}:{} )}));
    return {objectKey:key,storageName:key.split('/').pop()!,storageBackend:'s3',sha256:hash};
  }
  const root=path.resolve(process.env.UPLOAD_DIR||'./private-uploads');
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const name=crypto.randomUUID();
  await fs.writeFile(path.join(root,name),bytes,{flag:'wx',mode:0o600});
  return {objectKey:'',storageName:name,storageBackend:'local',sha256:hash};
}
export async function readPrivate(file:{storageBackend?:string;objectKey?:string;storageName?:string}) {
  if (file.storageBackend==='s3') {
    const key=String(file.objectKey||'');
    if(!/^tenants\/[0-9a-f]{24}\/companies\/[0-9a-f]{24}\//i.test(key))throw new Error('Invalid S3 key');
    const response=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    if(!response.Body)throw new Error('S3 document body missing');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  const name=String(file.storageName||'');
  if(!/^[0-9a-f-]{36}$/i.test(name)) throw new Error('Invalid local storage key');
  return fs.readFile(path.join(path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),name));
}
export async function deletePrivate(file:{storageBackend?:string;objectKey?:string;storageName?:string}){
  if(file.storageBackend==='s3' && file.objectKey){
    await client.send(new DeleteObjectCommand({Bucket:bucket,Key:file.objectKey}));
  } else if(file.storageName){
    await fs.unlink(path.join(path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),String(file.storageName))).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
}
