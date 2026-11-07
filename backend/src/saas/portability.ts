import { Readable } from 'node:stream';
import { once } from 'node:events';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import archiver from 'archiver';
import { parse } from 'csv-parse/sync';
import type { Request, Response } from 'express';
import { Company, User, Membership, WorkspaceSetting, TaskUpdate, StoredFile, JournalEntry, AuditLog, models } from '../models.js';
import { Tenant, TenantMembership, ExportAudit, ImportBatch } from './models.js';
import { readPrivate } from './storage.js';
import { HttpError, audit, can } from '../lib/security.js';

const exportedCollections:{[name:string]:mongoose.Model<any>}={
  companies:Company,companyMemberships:Membership,workspaceSettings:WorkspaceSetting,
  ...models,taskUpdates:TaskUpdate,storedFiles:StoredFile,journalEntries:JournalEntry,auditLogs:AuditLog,
};
const maxExportFiles=2000; // synchronous HTTP export cap; background jobs needed for enterprise sizes
const maxExportBytes=250*1024*1024;
function escapeName(v:string){return v.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,60);}

/** Portable customer archive: no passwords, MFA secrets or cross-tenant users. */
export async function streamPortableExport(req:Request,res:Response,companyId?:string){
  const tenantId=req.actor!.tenantId;
  if(!req.actor!.isSuperAdmin)throw new HttpError(403,'Tenant Super Admin required');
  if(companyId && !await Company.exists({_id:companyId,tenantId}))throw new HttpError(404,'Company not found');
  const scope=companyId?'company':'tenant';
  const fileDocs=await StoredFile.find(companyId?{companyId}:{tenantId}).lean();
  const totalBytes=fileDocs.reduce((n,f)=>n+Number(f.size||0),0);
  if(fileDocs.length>maxExportFiles||totalBytes>maxExportBytes)
    throw new HttpError(413,'Export exceeds synchronous limit: use a scheduled background archive worker');
  const log=await ExportAudit.create({tenantId,companyId,requestedBy:req.actor!.id,purpose:'tenant-portability',scope});
  const tenant=await Tenant.findById(tenantId).select('name slug').lean();
  const countByModel:Record<string,number>={};
  for(const [name,model] of Object.entries(exportedCollections)){
    if(companyId && ['workspaceSettings'].includes(name))continue;
    const filter=companyId?(name==='companies'?{_id:companyId}:{companyId}):{tenantId};
    countByModel[name]=await model.countDocuments(filter);
  }
  const zip=archiver('zip',{zlib:{level:6}});
  zip.on('error',e=>{console.error('Archive generation failed',e);res.destroy(e);});
  res.status(200).set({
    'Content-Type':'application/zip',
    'Content-Disposition':`attachment; filename="${escapeName(tenant?.slug||tenantId)}-${scope}-${new Date().toISOString().slice(0,10)}.zip"`,
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
  });
  zip.pipe(res);
  const manifest={format:'bitstek-saas-portable-v1',schema:'v6.1',exportedAt:new Date().toISOString(),
    tenant:{id:tenantId,name:tenant?.name,slug:tenant?.slug},scope,companyId:companyId||null,
    counts:countByModel,files:fileDocs.map(f=>({id:String(f._id),companyId:String(f.companyId),
      path:`documents/${String(f.companyId)}/${String(f._id)}-${escapeName(f.originalName)}`,
      size:f.size,sha256:f.sha256||null,originalName:f.originalName})),
    note:'Treat as confidential. Not an executable mongorestore dump. Re-import through version-aware migration tooling.'};
  try {
    zip.append(JSON.stringify(manifest,null,2),{name:'manifest.json'});
    zip.append('Portable schema revision v6.1. Excludes user passwords, MFA seeds, external API keys and unrelated tenants.\n'+
      'Import business records only after reconciliation and human approval.\n',{name:'migrations/RESTORE_README.txt'});
    for(const [name,model] of Object.entries(exportedCollections)){
      if(companyId && name==='workspaceSettings')continue;
      zip.append(Readable.from((async function*(){
        for await(const doc of model.find(companyId?(name==='companies'?{_id:companyId}:{companyId}):{tenantId}).lean().cursor())yield JSON.stringify(doc)+'\n';
      })()),{name:`database/${name}.jsonl`});
    }
    if(!companyId){
      const memberDocs=await TenantMembership.find({tenantId}).select('userId role active').lean();
      const identities=await User.find({_id:{$in:memberDocs.map(m=>m.userId)}})
        .select('_id name email active').lean();
      zip.append(JSON.stringify({identities,memberships:memberDocs},null,2),{name:'database/identity-directory.json'});
    }
    for(const file of fileDocs){
      const bytes=await readPrivate(file);
      const digest=crypto.createHash('sha256').update(bytes).digest('hex');
      if(file.sha256&&file.sha256!==digest)throw new HttpError(409,`Checksum mismatch for ${file._id}`);
      zip.append(bytes,{name:`documents/${String(file.companyId)}/${String(file._id)}-${escapeName(file.originalName)}`});
    }
    await zip.finalize();
    await ExportAudit.updateOne({_id:log._id},{$set:{status:'completed',recordCounts:countByModel,fileCount:fileDocs.length}});
    await audit(req,'saas.export.completed','tenants',tenantId,{scope,companyId:companyId||null,files:fileDocs.length});
  }catch(error){
    await ExportAudit.updateOne({_id:log._id},{$set:{status:'failed',error:String(error)}});
    zip.abort();
    if(!res.headersSent)throw error;
    res.destroy(error as Error);
  }
}

const importable:{[key:string]:{model:mongoose.Model<any>,fields:string[]}}={
  clients:{model:models.clients,fields:['title','email','phone','address','industry','contact','status']},
  students:{model:models.students,fields:['title','email','phone','phoneCountryCode','totalFees','mentor','status']},
  products:{model:models.products,fields:['title','sku','category','price','currency','billingCycle','status']},
  vendors:{model:models.vendors,fields:['title','email','phone','taxId','address','status']},
};
/** CSV headers are sourced from the same whitelist used by parseImport().
 * The default template is header-only to avoid accidental import of example data.
 */
export function importCsvTemplate(entity:string,includeSample=false){
  const type=importable[entity];
  if(!type)throw new HttpError(400,'Unsupported import type');
  const examples:Record<string,Record<string,string>>={
    clients:{title:'Example Client',email:'client@example.com',phone:'9000000000',address:'Example Address',industry:'IT',contact:'Example Contact',status:'active'},
    students:{title:'Example Student',email:'student@example.com',phone:'9000000000',phoneCountryCode:'+91',totalFees:'10000.00',mentor:'Example Mentor',status:'active'},
    products:{title:'Example Product',sku:'EXAMPLE-SKU-01',category:'Service',price:'1499.00',currency:'INR',billingCycle:'monthly',status:'active'},
    vendors:{title:'Example Vendor',email:'vendor@example.com',phone:'9000000000',taxId:'EXAMPLE-TAX-ID',address:'Example Address',status:'active'},
  };
  const escape=(value:string)=>`"${value.replace(/"/g,'""')}"`;
  const lines=[type.fields.map(escape).join(',')];
  if(includeSample) lines.push(type.fields.map(field=>escape(examples[entity]?.[field]||'')).join(','));
  return lines.join('\r\n')+'\r\n';
}
export function parseImport(entity:string,csvText:string,fieldMap?:Record<string,string>){
  const type=importable[entity];
  if(!type)throw new HttpError(400,'Unsupported import type. Use clients, students, products or vendors');
  if(csvText.length>2*1024*1024)throw new HttpError(413,'CSV exceeds 2 MB');
  let input:Record<string,string>[]=[];
  try {input=parse(csvText,{columns:true,bom:true,skip_empty_lines:true,trim:true,relax_quotes:false}) as Record<string,string>[];}
  catch{throw new HttpError(400,'Malformed CSV');}
  if(input.length>1000)throw new HttpError(413,'Import limit is 1,000 records per batch');
  const errors:{row:number,error:string}[]=[];
  const data:Record<string,unknown>[]=[];
  const map=fieldMap||{};
  for(const [index,row] of input.entries()){
    const cleaned:Record<string,unknown>={};
    for(const [from,value] of Object.entries(row)){
      const key=map[from]||from;
      if(type.fields.includes(key)&&value!==undefined&&value!=='')cleaned[key]=value;
    }
    if(!cleaned.title||String(cleaned.title).length>200){errors.push({row:index+2,error:'Title is required (up to 200 characters)'});continue;}
    if(cleaned.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(cleaned.email))) {
      errors.push({row:index+2,error:'Invalid email'});continue;
    }
    if(entity==='students'&&cleaned.totalFees&&!/^\d+(\.\d{1,2})?$/.test(String(cleaned.totalFees))){errors.push({row:index+2,error:'Invalid fees'});continue;}
    if(entity==='products'&&cleaned.price&&!/^\d+(\.\d{1,2})?$/.test(String(cleaned.price))){errors.push({row:index+2,error:'Invalid price'});continue;}
    data.push(cleaned);
  }
  return {entity,received:input.length,accepted:data.length,errors,data};
}
export async function commitImport(req:Request,entity:string,companyId:string,csvText:string,fieldMap?:Record<string,string>){
  const tenantId=req.actor!.tenantId;
  const domain=entity==='clients'?'sales':entity==='students'?'learning':entity==='products'?'products':'finance';
  if(!can(req,companyId,domain,'write'))throw new HttpError(403,'No import permission for this company');
  const result=parseImport(entity,csvText,fieldMap);
  if(result.errors.length)throw new HttpError(422,'Import contains invalid rows; use preview and correct them first');
  if(!result.data.length)throw new HttpError(400,'No valid rows');
  const digest=crypto.createHash('sha256').update(JSON.stringify({entity,companyId,csvText,fieldMap})).digest('hex');
  if(await ImportBatch.exists({tenantId,companyId,inputDigest:digest,status:'completed'}))
    throw new HttpError(409,'This exact import has already been applied');
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      // Mongoose create participates in ambient tenant context and transactional session.
      const docs=result.data.map(data=>({...data,companyId,createdBy:req.actor!.id}));
      await importable[entity].model.create(docs,{session,ordered:true});
      await ImportBatch.create([{tenantId,companyId,createdBy:req.actor!.id,entity,
        status:'completed',importedCount:docs.length,inputDigest:digest}],{session});
    });
    return {imported:result.data.length,errors:[]};
  }finally{await session.endSession();}
}
