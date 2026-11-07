import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Company, Task, Invoice, ApprovalRequest, StoredFile } from '../models.js';
import { Tenant, SaaSSubscription, SaaSPlan, ImportBatch, ExportAudit, AiUsage, TenantInvitation } from './models.js';
import { HttpError, audit, can, allowedCompanies, wrap } from '../lib/security.js';
import { parseImport, commitImport, streamPortableExport, importCsvTemplate } from './portability.js';
import { storageMode } from './storage.js';
const router=Router();
const requireTenantAdmin=(req:import('express').Request)=>{
  if(!req.actor?.isSuperAdmin)throw new HttpError(403,'Tenant Super Admin required');
};
/** Tenant-owned color palette; never overrides another subscriber. */
router.patch('/settings/theme',wrap(async(req,res)=>{
  requireTenantAdmin(req);
  const body=z.object({themeId:z.enum(['violet','ocean','emerald','sunset','slate'])}).parse(req.body);
  const tenant=await Tenant.findByIdAndUpdate(req.actor!.tenantId,{$set:{themeId:body.themeId}},{new:true});
  if(!tenant)throw new HttpError(404,'Workspace not found');
  await audit(req,'update','tenant-theme',String(tenant._id),{themeId:body.themeId});
  res.json({themeId:tenant.themeId});
}));
router.get('/overview',wrap(async(req,res)=>{requireTenantAdmin(req);
  const tid=req.actor!.tenantId;
  const [tenant,subscription,companies,files,imports,exports,aiRequests]=await Promise.all([
    Tenant.findById(tid).select('name slug status themeId').lean(),
    SaaSSubscription.findOne({tenantId:tid}).lean(),
    Company.find({tenantId:tid}).select('name code active enabledModules').lean(),
    StoredFile.find({tenantId:tid}).select('size companyId').lean(),
    ImportBatch.countDocuments({tenantId:tid}),ExportAudit.countDocuments({tenantId:tid}),
    AiUsage.countDocuments({tenantId:tid})
  ]);
  const plan=subscription?.planId?await SaaSPlan.findById(subscription.planId).lean():null;
  res.json({tenant,subscription,plan,companies:companies.length,
    files:files.length,storageBytes:files.reduce((n,f)=>n+(f.size||0),0),
    imports,exports,aiRequests,storageMode:storageMode()});
}));
router.get('/ai/daily-brief',wrap(async(req,res)=>{
  const ids=req.companyIds||[];
  const ops=allowedCompanies(req,'operations');
  const finance=allowedCompanies(req,'finance');
  const approvals=allowedCompanies(req,'approvals');
  const now=new Date();
  const [overdue,pendingInvoices,reviewRequests]=await Promise.all([
    ops.length?Task.countDocuments({companyId:{$in:ops},dueAt:{$lt:now},status:{$nin:['completed','archived']}}):0,
    finance.length?Invoice.countDocuments({companyId:{$in:finance},status:{$in:['sent','partial','approved']}}):0,
    approvals.length?ApprovalRequest.countDocuments({companyId:{$in:approvals},status:'pending',
      requestedBy:{$ne:req.actor!.id},reviewerIds:req.actor!.id}):0,
  ]);
  // This feature is deterministic/permission-aware until an optional LLM provider
  // has a reviewed data-processing agreement and explicit tenant consent.
  await AiUsage.create({tenantId:req.actor!.tenantId,userId:req.actor!.id,
    companyId:req.companyId==='all'?undefined:req.companyId,feature:'rules-based-daily-brief',model:'rules-v1'});
  res.json({mode:'rules-based',asOf:now.toISOString(),visibleCompanies:ids.length,
    metrics:{overdueTasks:overdue,openReceivables:pendingInvoices,approvalInbox:reviewRequests},
    messages:[`${overdue} overdue task(s) in your authorized work areas.`,
      `${pendingInvoices} open receivable(s) in accessible Finance modules.`,
      `${reviewRequests} pending request(s) assigned to you for approval.`],
    notice:'These counts are not generative AI and do not predict future financial outcomes.'});
}));
router.get('/imports/template/:entity',wrap(async(req,res)=>{
  requireTenantAdmin(req);
  const entity=z.enum(['clients','students','products','vendors']).parse(req.params.entity);
  const includeSample=req.query.example==='1';
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${entity}-${includeSample?'sample':'template'}.csv"`);
  res.setHeader('Cache-Control','no-store');
  res.send('\uFEFF'+importCsvTemplate(entity,includeSample));
}));
router.get('/imports',wrap(async(req,res)=>{requireTenantAdmin(req);
  res.json(await ImportBatch.find({tenantId:req.actor!.tenantId}).sort({createdAt:-1}).limit(30).lean());
}));
router.post('/imports/preview',wrap(async(req,res)=>{
  requireTenantAdmin(req);
  const input=z.object({entity:z.enum(['clients','students','products','vendors']),companyId:z.string(),
    csvText:z.string(),fieldMap:z.record(z.string()).optional()}).parse(req.body);
  if(!mongoose.isValidObjectId(input.companyId)||!await Company.exists({_id:input.companyId,tenantId:req.actor!.tenantId}))
    throw new HttpError(404,'Target company not found');
  const result=parseImport(input.entity,input.csvText,input.fieldMap);
  res.json({entity:input.entity,received:result.received,accepted:result.accepted,
    errors:result.errors,sample:result.data.slice(0,5)});
}));
router.post('/imports/commit',wrap(async(req,res)=>{
  requireTenantAdmin(req);
  const input=z.object({entity:z.enum(['clients','students','products','vendors']),companyId:z.string(),
    csvText:z.string(),fieldMap:z.record(z.string()).optional(),confirm:z.literal('IMPORT')}).parse(req.body);
  if(!mongoose.isValidObjectId(input.companyId)||!await Company.exists({_id:input.companyId,tenantId:req.actor!.tenantId}))
    throw new HttpError(404,'Target company not found');
  const result=await commitImport(req,input.entity,input.companyId,input.csvText,input.fieldMap);
  await audit(req,'saas.import','companies',input.companyId,{entity:input.entity,imported:result.imported},input.companyId);
  res.status(201).json(result);
}));
router.get('/exports',wrap(async(req,res)=>{requireTenantAdmin(req);
  res.json(await ExportAudit.find({tenantId:req.actor!.tenantId}).sort({createdAt:-1}).limit(30).lean());
}));
router.get('/exports/download',wrap(async(req,res)=>{
  requireTenantAdmin(req);
  const companyId=typeof req.query.companyId==='string'?req.query.companyId:undefined;
  if(companyId&&!mongoose.isValidObjectId(companyId))throw new HttpError(400,'Invalid company');
  await streamPortableExport(req,res,companyId);
}));
router.get('/tenant-invitations',wrap(async(req,res)=>{requireTenantAdmin(req);
  res.json(await TenantInvitation.find({tenantId:req.actor!.tenantId})
    .select('email role expiresAt claimedAt createdAt').sort({createdAt:-1}).limit(50).lean());
}));
export default router;
