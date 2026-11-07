import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Company, Membership, AuditLog, Task, Event, TaskUpdate, ApprovalRequest } from '../models.js';
import { BUSINESS_MODULES, effectiveModules, normalizeModules } from '../lib/company-modules.js';
import { HttpError, audit, wrap } from '../lib/security.js';
import { companyImpact, operationsMigrationPreview } from '../lib/company-lifecycle.js';
import { streamPortableExport } from '../saas/portability.js';
const router=Router();
function superAdmin(req:import('express').Request){
  if(!req.actor?.isSuperAdmin)throw new HttpError(403,'Super Admin privilege required');
}
function id(value:string){if(!mongoose.isValidObjectId(value))throw new HttpError(400,'Invalid company ID');return value;}
const modulesSchema=z.array(z.enum(BUSINESS_MODULES)).max(BUSINESS_MODULES.length).refine(a=>new Set(a).size===a.length,'Duplicate modules');
const edits=z.object({name:z.string().trim().min(2).max(120),code:z.string().trim().min(2).max(15).regex(/^[A-Za-z0-9_-]+$/).optional(),vertical:z.string().trim().min(2).max(120),currency:z.enum(['INR','USD','AED','SAR']),enabledModules:modulesSchema}).strict();

router.get('/',wrap(async(req,res)=>{
  superAdmin(req);
  const companies=await Company.find().sort({active:-1,name:1}).lean();
  res.json(companies.map(c=>({...c,enabledModules:effectiveModules(c)})));
}));
router.get('/:id/impact',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id)).lean();
  if(!company)throw new HttpError(404,'Company not found');
  const impact=await companyImpact(String(company._id));
  res.json({company:{_id:company._id,name:company.name,code:company.code,active:company.active},...impact,
    warning:'Finance, audit and cross-company references cannot be permanently deleted or moved without specific reconciliation.'});
}));
router.get('/:id/export',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id)).lean();
  if(!company)throw new HttpError(404,'Company not found');
  // Record the export request before streaming. It will be present in the archive.
  await audit(req,'company.export','companies',String(company._id),{code:company.code},String(company._id));
  try{await streamPortableExport(req,res,String(company._id));}
  catch(err){if(res.headersSent){res.destroy(err as Error);return;}throw err;}
}));
router.patch('/:id',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id));
  if(!company)throw new HttpError(404,'Company not found');
  const input=edits.omit({code:true}).extend({acknowledgeImpact:z.boolean().optional()}).parse(req.body);
  const current=effectiveModules(company);
  const removed=current.filter(x=>!input.enabledModules.includes(x));
  if(removed.length){
    const impact=await companyImpact(String(company._id));
    const moduleCollections:Record<string,string[]>={
      operations:['tasks','events','taskUpdates'],learning:['students','courses','batches','mentors','internships','installments'],
      advisory:['tradingAccounts','traders','dailyPerformance','capitalMovements','usdtTransactions'],
      sales:['clients','leads','proposals'],products:['products','subscriptions'],projects:['projects','milestones'],
      finance:['invoices','expenses','transfers','receipts','bankAccounts','vendors','journalEntries'],approvals:['approvals'],reports:[],
    };
    const risky=removed.filter(domain=>(moduleCollections[domain]||[]).some(collection=>(impact.counts[collection]||0)>0));
    if(impact.pendingApprovals && removed.some(d=>['approvals','finance','advisory'].includes(d)))
      throw new HttpError(409,'Pending approvals must be resolved before disabling approvals, finance or advisory');
    if(impact.openInvoices && removed.includes('finance'))throw new HttpError(409,'Open invoices must be resolved before Finance is disabled');
    if(impact.openProjects && removed.includes('projects'))throw new HttpError(409,'Active projects must be completed before Projects is disabled');
    if(risky.length && !input.acknowledgeImpact)throw new HttpError(409,'Existing data may become inaccessible. Confirm the module-change impact before saving.');
  }
  const updated=await Company.findByIdAndUpdate(company._id,{$set:{name:input.name,vertical:input.vertical,currency:input.currency,enabledModules:normalizeModules(input.enabledModules)}},{new:true,runValidators:true});
  await audit(req,'company.modules.update','companies',String(company._id),{previous:current,next:input.enabledModules,vertical:input.vertical},String(company._id));
  res.json(updated);
}));
router.post('/:id/deactivate',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id));
  if(!company)throw new HttpError(404,'Company not found');
  if(!company.active)throw new HttpError(409,'Company is already deactivated');
  const {confirmation}=z.object({confirmation:z.string()}).parse(req.body);
  if(confirmation!==company.code)throw new HttpError(400,`Type the company code ${company.code} to confirm`);
  const impact=await companyImpact(String(company._id));
  if(impact.pendingApprovals||impact.openInvoices||impact.openExpenses)
    throw new HttpError(409,'Resolve pending approvals, open invoices and expenses before deactivating the company');
  company.active=false;company.deactivatedAt=new Date();await company.save();
  await audit(req,'company.deactivate','companies',String(company._id),{impact:impact.counts},String(company._id));
  res.json({deactivated:true,companyId:String(company._id)});
}));
router.post('/:id/reactivate',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id));
  if(!company)throw new HttpError(404,'Company not found');
  company.active=true;company.deactivatedAt=undefined;await company.save();
  await audit(req,'company.reactivate','companies',String(company._id),{},String(company._id));
  res.json({reactivated:true});
}));
router.get('/:id/migration-preview',wrap(async(req,res)=>{
  superAdmin(req);const sourceId=id(req.params.id),targetId=id(String(req.query.targetCompanyId||''));
  if(sourceId===targetId)throw new HttpError(400,'Source and destination must differ');
  const [source,target]=await Promise.all([Company.findById(sourceId),Company.findById(targetId)]);
  if(!source||!target||!target.active)throw new HttpError(404,'A company is unavailable');
  const preview=await operationsMigrationPreview(sourceId,targetId);
  res.json({...preview,scope:'operations',note:'Only Tasks, Task Updates and Calendar Events are supported for automated movement. Other modules require export and an approved, domain-specific migration.'});
}));
router.post('/:id/migrate-operations',wrap(async(req,res)=>{
  superAdmin(req);const sourceId=id(req.params.id);
  const {targetCompanyId,confirmation}=z.object({targetCompanyId:z.string(),confirmation:z.string()}).parse(req.body);
  id(targetCompanyId);
  if(sourceId===targetCompanyId)throw new HttpError(400,'Source and destination must differ');
  const [source,target]=await Promise.all([Company.findById(sourceId),Company.findById(targetCompanyId)]);
  if(!source||!target||!source.active||!target.active)throw new HttpError(404,'Both companies must be active');
  if(confirmation!==`MIGRATE ${source.code}`)throw new HttpError(400,`Confirm with MIGRATE ${source.code}`);
  if(!effectiveModules(target).includes('operations'))throw new HttpError(409,'Enable Operations for the destination company first');
  const preview=await operationsMigrationPreview(sourceId,targetCompanyId);
  if(!preview.eligible)throw new HttpError(409,`Resolve task approvals and assign task/event users to the destination first. Unassigned users: ${preview.unassignedUsers.join(', ')}`);
  // All-or-nothing and revalidate inside the transaction to prevent partial moves.
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    const state=await operationsMigrationPreview(sourceId,targetCompanyId);
    if(!state.eligible)throw new HttpError(409,'Assignments changed, review migration again');
    const ids=(await Task.find({companyId:sourceId}).select('_id').session(session).lean()).map(t=>t._id);
    await Task.updateMany({companyId:sourceId},{$set:{companyId:targetCompanyId}},{session});
    await Event.updateMany({companyId:sourceId},{$set:{companyId:targetCompanyId}},{session});
    await TaskUpdate.updateMany({companyId:sourceId,taskId:{$in:ids}},{$set:{companyId:targetCompanyId}},{session});
    await AuditLog.create([{userId:req.actor!.id,companyId:sourceId,action:'company.operations.migrated-out',entity:'companies',entityId:sourceId,details:{targetCompanyId,counts:state}},
      {userId:req.actor!.id,companyId:targetCompanyId,action:'company.operations.migrated-in',entity:'companies',entityId:targetCompanyId,details:{sourceId,counts:state}}],{session});
  });}finally{await session.endSession();}
  res.json({migrated:true,...preview});
}));
router.delete('/:id',wrap(async(req,res)=>{
  superAdmin(req);const company=await Company.findById(id(req.params.id));
  if(!company)throw new HttpError(404,'Company not found');
  const {confirmation,acknowledgeExport}=z.object({confirmation:z.string(),acknowledgeExport:z.literal(true)}).parse(req.body);
  if(confirmation!==`DELETE ${company.code}`)throw new HttpError(400,`Confirmation must be DELETE ${company.code}`);
  const impact=await companyImpact(String(company._id));
  if(!impact.deletionEligible)throw new HttpError(409,'Company contains business data, private files, posted journals or cross-company references. Export/migrate records and archive the company instead.');
  // Do not silently destroy historical audit. Leave non-PII tombstone references in audit logs.
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    const another=await companyImpact(String(company._id));
    if(!another.deletionEligible)throw new HttpError(409,'Company records changed; deletion cancelled');
    await Membership.deleteMany({companyId:company._id},{session});
    await AuditLog.create([{userId:req.actor!.id,companyId:company._id,action:'company.delete',entity:'companies',entityId:company._id,details:{name:company.name,code:company.code,auditRetained:true}}],{session});
    await Company.deleteOne({_id:company._id},{session});
  });}finally{await session.endSession();}
  res.json({deleted:true,auditRetained:true});
}));
export default router;
