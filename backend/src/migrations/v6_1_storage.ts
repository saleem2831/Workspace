/** Move legacy local documents to S3 without deleting local originals. */
import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Tenant } from '../saas/models.js';
import { runWithTenant } from '../saas/tenant-context.js';
import { StoredFile } from '../models.js';
import { putPrivate } from '../saas/storage.js';
const apply=process.argv.includes('--apply');
if(process.env.STORAGE_BACKEND!=='s3')throw new Error('Set STORAGE_BACKEND=s3 and S3_BUCKET in backend/.env');
await mongoose.connect(process.env.MONGODB_URI||'');
try{
  for(const tenant of await Tenant.find({status:{$ne:'archived'}})){
    const id=String(tenant._id);
    await runWithTenant(id,async()=>{
      const files=await StoredFile.find({storageBackend:{$ne:'s3'}}).lean();
      console.log(`${tenant.slug}: ${files.length} legacy files to migrate (${apply?'apply':'dry run'})`);
      for(const file of files){
        const name=String(file.storageName);
        if(!/^[a-f0-9-]{36}$/i.test(name))throw new Error(`Invalid local file ${file._id}`);
        const bytes=await fs.readFile(path.join(path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),name));
        if(!apply)continue;
        const stored=await putPrivate(id,String(file.companyId),file.purpose,bytes,file.mime);
        await StoredFile.updateOne({_id:file._id,storageBackend:{$ne:'s3'}},{$set:stored});
        console.log(`Copied ${file._id} to S3. Local original retained for rollback.`);
      }
    });
  }
}finally{await mongoose.disconnect();}
