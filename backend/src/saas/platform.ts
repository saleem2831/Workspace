import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User, Company, Membership, StoredFile, TaskUpdate, JournalEntry, AuditLog, WorkspaceSetting, models } from '../models.js';
import { PlatformOperator, Tenant, TenantMembership, SaaSPlan, SaaSSubscription, TenantInvitation, PlatformAudit, ExportAudit, ImportBatch, AiUsage, SupportGrant, PlatformSetting } from './models.js';
import { HttpError, wrap } from '../lib/security.js';
import { runWithTenant } from './tenant-context.js';
import {PlatformMigration,eligibleForApproval} from './migration-model.js';

const router=Router();
const baseDomain=(process.env.SAAS_BASE_DOMAIN||'').trim().toLowerCase().replace(/^\./,'');
const validSubdomain=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const reservedSubdomains=new Set(['www','api','admin','platform','auth','app','mail','smtp','support','help','status','static','assets','cdn']);
function validateSubdomain(v:string){
  if(!validSubdomain.test(v)||reservedSubdomains.has(v))throw new HttpError(400,'Invalid or reserved tenant subdomain');
  return v;
}
async function logPlatform(req:import('express').Request,tenantId:string|undefined,action:string,details:Record<string,unknown>){
  await PlatformAudit.create({operatorId:req.actor!.id,tenantId,action,details});
}
function ensureObjectId(id:string){if(!mongoose.isValidObjectId(id))throw new HttpError(400,'Invalid tenant or user ID');}

async function operator(req:import('express').Request){
  const account=await User.findById(req.actor!.id).select('mfaEnabled active').lean();
  const role=await PlatformOperator.findOne({userId:req.actor!.id,active:true});
  if(!account?.active||!account.mfaEnabled||!role||!['owner','operator'].includes(role.level))
    throw new HttpError(403,'MFA-enabled Platform Operator required');
}
async function platformOwner(req:import('express').Request){
  await operator(req);
  if(!await PlatformOperator.exists({userId:req.actor!.id,active:true,level:'owner'}))
    throw new HttpError(403,'MFA-enabled Platform Owner required for infrastructure migrations');
}

const themeSchema=z.enum(['violet','ocean','emerald','sunset','slate']);
const planSchema=z.object({
  name:z.string().trim().min(2).max(100),maxCompanies:z.number().int().min(1).max(1000),
  maxUsers:z.number().int().min(1).max(100000),storageLimitBytes:z.number().int().min(0),
  aiMonthlyCredits:z.number().int().min(0),monthlyPriceMinor:z.number().int().min(0),
  currency:z.enum(['INR','USD','AED','SAR'])
});
/** Platform-wide settings, separate from customer workspace branding. */
router.get('/settings',wrap(async(req,res)=>{
  await operator(req);
  const value=await PlatformSetting.findOne({key:'global'}).lean();
  res.json(value||{platformName:'Bitstek Workspace Platform',supportEmail:'',defaultLocale:'en',defaultTheme:'violet'});
}));
router.patch('/settings',wrap(async(req,res)=>{
  await platformOwner(req);
  const input=z.object({platformName:z.string().trim().min(2).max(100),
    supportEmail:z.union([z.literal(''),z.string().email()]),
    defaultLocale:z.enum(['en','ar']),defaultTheme:themeSchema}).parse(req.body);
  const result=await PlatformSetting.findOneAndUpdate({key:'global'},{$set:input},
    {new:true,upsert:true,runValidators:true});
  await logPlatform(req,undefined,'platform.settings.update',{platformName:input.platformName,supportEmail:input.supportEmail,defaultTheme:input.defaultTheme});
  res.json(result);
}));
router.patch('/tenants/:id/theme',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const input=z.object({themeId:themeSchema,confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(input.confirmation!==tenant.slug)throw new HttpError(400,'Type workspace code to confirm');
  const oldTheme=tenant.themeId||'violet';tenant.themeId=input.themeId;await tenant.save();
  await logPlatform(req,String(tenant._id),'tenant.theme.update',{oldTheme,themeId:input.themeId});
  res.json({themeId:tenant.themeId});
}));
/** Plans in active subscriptions may be edited only if all existing tenants still fit the new limits. */
router.patch('/plans/:id',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const input=planSchema.extend({active:z.boolean(),confirmation:z.string()}).parse(req.body);
  const plan=await SaaSPlan.findById(req.params.id);
  if(!plan)throw new HttpError(404,'Plan not found');
  if(input.confirmation!==plan.code)throw new HttpError(400,'Type plan code to confirm');
  const linked=await SaaSSubscription.find({planId:plan._id}).select('tenantId').lean();
  for(const subscription of linked){
    const companyCount=await runWithTenant(String(subscription.tenantId),()=>Company.countDocuments({tenantId:subscription.tenantId,active:true}));
    const seats=await TenantMembership.countDocuments({tenantId:subscription.tenantId,active:true});
    if(companyCount>input.maxCompanies||seats>input.maxUsers)
      throw new HttpError(409,`Plan too small for assigned tenant usage (${companyCount} companies / ${seats} seats)`);
  }
  const old=plan.toObject();const {confirmation:_confirmation,...changes}=input;Object.assign(plan,changes);await plan.save();
  await logPlatform(req,undefined,'plan.update',{planId:String(plan._id),code:plan.code,previous:{maxCompanies:old.maxCompanies,maxUsers:old.maxUsers,monthlyPriceMinor:old.monthlyPriceMinor,active:old.active},next:input});
  res.json(plan);
}));
/** Permanently remove only unused plans; subscribed plans must first be reassigned. */
router.delete('/plans/:id',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const {confirmation}=z.object({confirmation:z.string()}).parse(req.body);
  const plan=await SaaSPlan.findById(req.params.id);
  if(!plan)throw new HttpError(404,'Plan not found');
  if(confirmation!==`DELETE ${plan.code}`)throw new HttpError(400,`Type DELETE ${plan.code} to confirm`);
  if(await SaaSSubscription.exists({planId:plan._id})||await Tenant.exists({planId:plan._id}))
    throw new HttpError(409,'Plan has assigned tenants. Reassign those subscriptions before deleting.');
  await SaaSPlan.deleteOne({_id:plan._id});
  await logPlatform(req,undefined,'plan.delete',{planId:String(plan._id),code:plan.code});
  res.json({deleted:true});
}));
router.get('/tenants',wrap(async(req,res)=>{
  await operator(req);
  const tenants=await Tenant.find().sort({createdAt:-1}).limit(100).lean();
  const subscriptions=await SaaSSubscription.find({tenantId:{$in:tenants.map(t=>t._id)}}).lean();
  res.json(tenants.map(t=>({...t,tenantUrl:baseDomain&&t.subdomain?`https://${t.subdomain}.${baseDomain}`:null,subscription:subscriptions.find(s=>String(s.tenantId)===String(t._id))||null})));
}));
router.get('/plans',wrap(async(req,res)=>{await operator(req);
  res.json(await SaaSPlan.find().sort({active:-1,monthlyPriceMinor:1}).lean());
}));
router.post('/plans',wrap(async(req,res)=>{await platformOwner(req);
  const input=planSchema.extend({code:z.string().regex(/^[a-z0-9-]{2,40}$/)}).parse(req.body);
  const result=await SaaSPlan.create(input);
  await logPlatform(req,undefined,'plan.create',{planId:String(result._id),code:result.code});
  res.status(201).json(result);
}));
router.post('/tenants',wrap(async(req,res)=>{
  await operator(req);
  const input=z.object({name:z.string().min(2).max(100),slug:z.string().regex(/^[a-z0-9-]{2,80}$/),
    subdomain:z.string().min(2).max(63).optional(),
    ownerEmail:z.string().email(),planId:z.string(),defaultLocale:z.enum(['en','ar']).default('en'),themeId:themeSchema.optional(),initialCompanyName:z.string().min(2).max(120).optional()}).parse(req.body);
  const appearance=await PlatformSetting.findOne({key:'global'}).select('defaultTheme defaultLocale').lean();
  if(!mongoose.isValidObjectId(input.planId))throw new HttpError(400,'Invalid plan');
  const subdomain=validateSubdomain(input.subdomain||input.slug);
  if(await Tenant.exists({slug:input.slug}))throw new HttpError(409,'Workspace code is already in use');
  if(await Tenant.exists({subdomain}))throw new HttpError(409,'Subdomain already assigned');
  const plan=await SaaSPlan.findOne({_id:input.planId,active:true});
  if(!plan)throw new HttpError(404,'Plan not found');
  const token=crypto.randomBytes(32).toString('hex');
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const transaction=await mongoose.startSession();
  let tenantId='';
  try{
    await transaction.withTransaction(async()=>{
      const [tenant]=await Tenant.create([{name:input.name,slug:input.slug,subdomain,defaultLocale:input.defaultLocale,themeId:input.themeId||appearance?.defaultTheme||'violet',planId:plan._id,
        status:'active',primaryContactEmail:input.ownerEmail.toLowerCase(),createdBy:req.actor!.id}],{session:transaction});
      tenantId=String(tenant._id);
      await SaaSSubscription.create([{tenantId:tenant._id,planId:plan._id,status:'trialing',
        currentPeriodEnd:new Date(Date.now()+14*86400000),provider:'manual'}],{session:transaction});
      await TenantInvitation.create([{tenantId:tenant._id,email:input.ownerEmail.toLowerCase(),
        tokenHash,role:'super_admin',expiresAt:new Date(Date.now()+48*3600000),createdBy:req.actor!.id}],{session:transaction});
      // Every subscribed tenant must have a usable company at first login.
      await runWithTenant(tenantId,async()=>{
        await Company.create([{name:input.initialCompanyName||`${input.name} Primary`,
          code:'PRIMARY',vertical:'General Business',currency:'INR',enabledModules:['operations','sales','finance','approvals','reports']}],{session:transaction});
      });
    });
  }finally{await transaction.endSession();}
  // Invite token is returned only once; the operator must share it securely.
  // Production email delivery is an explicit integration gate, not simulated.
  await logPlatform(req,tenantId,'tenant.create',{slug:input.slug,subdomain,planId:input.planId});
  res.setHeader('Cache-Control','no-store');
  res.status(201).json({tenantId,slug:input.slug,subdomain,tenantUrl:baseDomain?`https://${subdomain}.${baseDomain}`:null,inviteToken:token,expiresHours:48,
    note:'Invitation must be claimed before the first login. Use the activation link; email sending is not configured.'});
}));
/** Workspace metadata; slug remains immutable because it is used for login. */
router.patch('/tenants/:id',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const input=z.object({name:z.string().trim().min(2).max(100),
    primaryContactEmail:z.string().email().transform(x=>x.toLowerCase()),
    defaultLocale:z.enum(['en','ar']),confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(input.confirmation!==tenant.slug)throw new HttpError(400,'Type workspace code to confirm');
  const before={name:tenant.name,primaryContactEmail:tenant.primaryContactEmail,defaultLocale:tenant.defaultLocale};
  tenant.name=input.name;tenant.primaryContactEmail=input.primaryContactEmail;tenant.defaultLocale=input.defaultLocale;
  await tenant.save();
  await logPlatform(req,String(tenant._id),'tenant.details.update',{before,after:input});
  res.json({name:tenant.name,primaryContactEmail:tenant.primaryContactEmail,defaultLocale:tenant.defaultLocale,
    note:'Contact email does not alter user login email. Change a user email separately through verified account management.'});
}));
router.patch('/tenants/:id/status',wrap(async(req,res)=>{
  await platformOwner(req);
  if(!mongoose.isValidObjectId(req.params.id))throw new HttpError(400,'Invalid tenant ID');
  const {status,confirmation}=z.object({status:z.enum(['active','suspended','archived']),confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(confirmation!==tenant.slug)throw new HttpError(400,'Type tenant slug to confirm');
  if(String(tenant._id)===req.actor!.tenantId && status!=='active')
    throw new HttpError(409,'Cannot suspend or archive your current Platform Owner login tenant. Switch to an independent active platform administration tenant first.');
  if(status==='archived' && tenant.status==='active')throw new HttpError(409,'Suspend and export before archiving');
  const previousStatus=tenant.status;tenant.status=status;await tenant.save();
  await logPlatform(req,String(tenant._id),'tenant.status',{status,previousStatus});
  res.json({tenantId:tenant._id,status:tenant.status,note:'This does not permanently erase business or document history.'});
}));
/** Platform Owner plan upgrades. These are *manual metadata overrides*, not payment collection. */
router.patch('/tenants/:id/subscription',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const {planId,status,confirmation}=z.object({planId:z.string(),status:z.enum(['trialing','active','past_due','cancelled','suspended']),confirmation:z.string()}).parse(req.body);
  if(!mongoose.isValidObjectId(planId))throw new HttpError(400,'Invalid plan ID');
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(confirmation!==tenant.slug)throw new HttpError(400,'Type the workspace code to confirm');
  const plan=await SaaSPlan.findOne({_id:planId,active:true});
  if(!plan)throw new HttpError(404,'Plan unavailable');
  const activeCompanies=await runWithTenant(String(tenant._id),()=>Company.countDocuments({tenantId:tenant._id,active:true}));
  const activeSeats=await TenantMembership.countDocuments({tenantId:tenant._id,active:true});
  if(activeCompanies>plan.maxCompanies||activeSeats>plan.maxUsers)
    throw new HttpError(409,`Plan too small for current usage: ${activeCompanies} companies and ${activeSeats} users`);
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    await SaaSSubscription.findOneAndUpdate({tenantId:tenant._id},{$set:{planId:plan._id,status,provider:'manual'}},
      {new:true,upsert:true,session});
    await Tenant.updateOne({_id:tenant._id},{$set:{planId:plan._id}},{session});
  });}finally{await session.endSession();}
  await logPlatform(req,String(tenant._id),'tenant.plan.change',{planId,status,activeSeats,activeCompanies});
  res.json({tenantId:tenant._id,planId,status,activeSeats,activeCompanies,note:'Manual plan change only; no payment was captured.'});
}));
router.patch('/tenants/:id/subdomain',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const {subdomain,confirmation}=z.object({subdomain:z.string().min(2).max(63).toLowerCase(),confirmation:z.string()}).parse(req.body);
  validateSubdomain(subdomain);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(confirmation!==tenant.slug)throw new HttpError(400,'Type the workspace code to confirm');
  if(await Tenant.exists({_id:{$ne:tenant._id},subdomain}))throw new HttpError(409,'Subdomain already assigned');
  const previous=tenant.subdomain||'';
  tenant.subdomain=subdomain;await tenant.save();
  await logPlatform(req,String(tenant._id),'tenant.subdomain.change',{previous,subdomain});
  res.json({subdomain,tenantUrl:baseDomain?`https://${subdomain}.${baseDomain}`:null,
    note:'DNS wildcard, TLS certificate, reverse proxy and app origin configuration are required before the subdomain is live.'});
}));
router.get('/tenants/:id/users',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const tenant=await Tenant.findById(req.params.id).lean();
  if(!tenant)throw new HttpError(404,'Tenant not found');
  const memberships=await TenantMembership.find({tenantId:tenant._id}).limit(500).lean();
  const users=await User.find({_id:{$in:memberships.map(m=>m.userId)}}).select('_id name email active mfaEnabled').lean();
  const companyMembers=await runWithTenant(String(tenant._id),()=>Membership.find({tenantId:tenant._id,active:true,removedAt:{$exists:false}}).select('userId companyId role').lean());
  res.json(memberships.map(m=>{
    const u=users.find(v=>String(v._id)===String(m.userId));
    return {userId:String(m.userId),name:u?.name||'Unknown',email:u?.email||'',accountActive:!!u?.active,
      tenantActive:!!m.active,tenantRole:m.role,mfaEnabled:!!u?.mfaEnabled,
      companies:companyMembers.filter(c=>String(c.userId)===String(m.userId)).map(c=>({companyId:String(c.companyId),role:c.role}))};
  }));
}));
router.patch('/tenants/:id/users/:userId/email',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);ensureObjectId(req.params.userId);
  const {email,confirmation}=z.object({email:z.string().email().transform(v=>v.toLowerCase()),confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  const membership=await TenantMembership.findOne({tenantId:tenant._id,userId:req.params.userId});
  if(!membership)throw new HttpError(404,'User is not a member of this tenant');
  const user=await User.findById(req.params.userId);
  if(!user)throw new HttpError(404,'User not found');
  if(String(user._id)===req.actor!.id||await PlatformOperator.exists({userId:user._id,active:true}))
    throw new HttpError(403,'Platform accounts must use separately verified recovery');
  if(await TenantMembership.countDocuments({userId:user._id})!==1)
    throw new HttpError(409,'User belongs to multiple tenants; shared identity requires a separate verified email-change workflow');
  if(confirmation!==user.email)throw new HttpError(400,'Type the current email to confirm');
  if(email===user.email)throw new HttpError(409,'Email is unchanged');
  if(await User.exists({email}))throw new HttpError(409,'Email is already registered');
  const oldEmail=user.email;
  const updated=await User.updateOne({_id:user._id,email:oldEmail},{$set:{email},$inc:{sessionVersion:1}});
  if(!updated.modifiedCount)throw new HttpError(409,'Account changed while updating');
  if(tenant.primaryContactEmail===oldEmail)await Tenant.updateOne({_id:tenant._id},{$set:{primaryContactEmail:email}});
  await logPlatform(req,String(tenant._id),'tenant.user.email.change',{userId:String(user._id),oldEmail,newEmail:email});
  res.json({userId:user._id,email,note:'All previous sessions revoked. Verify new mailbox ownership before enabling self-service recovery or production use.'});
}));
/** Change a user's display name or tenant-specific activation without touching other tenants. */
router.patch('/tenants/:id/users/:userId',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);ensureObjectId(req.params.userId);
  const input=z.object({name:z.string().trim().min(2).max(100),tenantActive:z.boolean(),confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(input.confirmation!==tenant.slug)throw new HttpError(400,'Type workspace code to confirm');
  const member=await TenantMembership.findOne({tenantId:tenant._id,userId:req.params.userId});
  const user=await User.findById(req.params.userId);
  if(!member||!user)throw new HttpError(404,'Tenant user not found');
  if(String(user._id)===req.actor!.id||await PlatformOperator.exists({userId:user._id,active:true}))
    throw new HttpError(403,'Use a separate verified recovery process for platform accounts');
  if(member.role==='super_admin' && member.active && !input.tenantActive){
    if(await TenantMembership.countDocuments({tenantId:tenant._id,role:'super_admin',active:true})<=1)
      throw new HttpError(409,'Cannot deactivate the final tenant Super Admin');
  }
  const before={name:user.name,tenantActive:member.active};
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    await User.updateOne({_id:user._id},{$set:{name:input.name},$inc:{sessionVersion:1}},{session});
    await TenantMembership.updateOne({_id:member._id},{$set:{active:input.tenantActive}},{session});
  });}finally{await session.endSession();}
  await logPlatform(req,String(tenant._id),'tenant.user.update',{userId:String(user._id),before,after:{name:input.name,tenantActive:input.tenantActive}});
  res.json({userId:user._id,name:input.name,tenantActive:input.tenantActive});
}));
/** Reissue a leaked, lost, or expired (unclaimed) admin invitation. */
router.post('/tenants/:id/reissue-invite',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const {confirmation}=z.object({confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findOne({_id:req.params.id,status:'active'});
  if(!tenant)throw new HttpError(404,'Active tenant not found');
  if(confirmation!==tenant.slug)throw new HttpError(400,'Type workspace code to confirm');
  const alreadyAdmin=await TenantMembership.exists({tenantId:tenant._id,role:'super_admin',active:true});
  if(alreadyAdmin)throw new HttpError(409,'Tenant already has a Super Admin; use user management instead');
  const email=tenant.primaryContactEmail;
  if(!email)throw new HttpError(409,'No invited email on tenant');
  const token=crypto.randomBytes(32).toString('hex');
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    await TenantInvitation.updateMany({tenantId:tenant._id,claimedAt:{$exists:false}},{$set:{expiresAt:new Date(0)}},{session});
    await TenantInvitation.create([{tenantId:tenant._id,email,tokenHash,role:'super_admin',
      expiresAt:new Date(Date.now()+48*3600000),createdBy:req.actor!.id}],{session});
  });}finally{await session.endSession();}
  await logPlatform(req,String(tenant._id),'tenant.invite.reissue',{email});
  res.setHeader('Cache-Control','no-store');
  res.json({tenantId:tenant._id,email,inviteToken:token,expiresHours:48,
    note:'Old unclaimed tokens have been invalidated. Share this token privately; it will be shown only once.'});
}));
router.delete('/tenants/:id',wrap(async(req,res)=>{
  await platformOwner(req);ensureObjectId(req.params.id);
  const {confirmation}=z.object({confirmation:z.string()}).parse(req.body);
  const tenant=await Tenant.findById(req.params.id);
  if(!tenant)throw new HttpError(404,'Tenant not found');
  if(confirmation!==`DELETE EMPTY ${tenant.slug}`)throw new HttpError(400,`Type DELETE EMPTY ${tenant.slug} to confirm`);
  if(String(tenant._id)===req.actor!.tenantId)throw new HttpError(409,'Cannot delete the currently authenticated platform administration tenant');
  if(tenant.status!=='archived')throw new HttpError(409,'Suspend, export, then archive the tenant before deletion');
  const [membershipCount,subscriptions]=await Promise.all([
    TenantMembership.countDocuments({tenantId:tenant._id}),SaaSSubscription.findOne({tenantId:tenant._id}).lean()
  ]);
  if(membershipCount)throw new HttpError(409,'Tenant has members; archive and export instead of deleting it');
  if(subscriptions?.provider!=='manual'||subscriptions?.providerSubscriptionId)
    throw new HttpError(409,'Linked billing provider must be resolved before deletion');
  const protectedModels=[...Object.values(models),Membership,TaskUpdate,StoredFile,JournalEntry,AuditLog,WorkspaceSetting];
  const counts=await runWithTenant(String(tenant._id),()=>Promise.all(protectedModels.map(m=>m.countDocuments({tenantId:tenant._id}))));
  if(counts.some(x=>x>0))throw new HttpError(409,'Tenant contains business, financial, document or audit records; archive and export instead');
  if(await Promise.all([ImportBatch,ExportAudit,AiUsage,SupportGrant].map(m=>m.countDocuments({tenantId:tenant._id}))).then(n=>n.some(x=>x>0)))
    throw new HttpError(409,'Tenant has recorded activity; archive and export instead');
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
    await runWithTenant(String(tenant._id),()=>Company.deleteMany({tenantId:tenant._id},{session}));
    await TenantInvitation.deleteMany({tenantId:tenant._id},{session});
    await SaaSSubscription.deleteMany({tenantId:tenant._id},{session});
    await Tenant.deleteOne({_id:tenant._id},{session});
  });}finally{await session.endSession();}
  await logPlatform(req,String(tenant._id),'tenant.delete.empty',{slug:tenant.slug});
  res.json({deleted:true,tenantId:tenant._id,note:'Only a tenant with no business activity, files, members or audit records can be hard-deleted.'});
}));
/** Requests and reviews record intent, not database credentials or an unsafe web-triggered cutover. */
router.get('/migrations',wrap(async(req,res)=>{
  await platformOwner(req);
  res.json(await PlatformMigration.find().select('-__v').sort({createdAt:-1}).limit(40).lean());
}));
router.post('/migrations',wrap(async(req,res)=>{
  await platformOwner(req);
  const input=z.object({kind:z.enum(['database','storage']),sourceLabel:z.string().regex(/^[a-z0-9][a-z0-9 _.-]{1,79}$/i),
    targetLabel:z.string().regex(/^[a-z0-9][a-z0-9 _.-]{1,79}$/i),reason:z.string().min(12).max(1000)}).parse(req.body);
  if(input.sourceLabel.toLowerCase()===input.targetLabel.toLowerCase())throw new HttpError(400,'Source and target labels must differ');
  const plan=await PlatformMigration.create({...input,requestedBy:req.actor!.id,status:'planned'});
  res.status(201).json({id:plan._id,status:plan.status,
    note:'A different MFA-enabled Platform Owner must approve. The migration runs from an authorized offline terminal, not this browser.'});
}));
router.post('/migrations/:id/approve',wrap(async(req,res)=>{
  await platformOwner(req);
  if(!mongoose.isValidObjectId(req.params.id))throw new HttpError(400,'Invalid plan ID');
  const {confirmation}=z.object({confirmation:z.literal('APPROVE MIGRATION')}).parse(req.body);
  const plan=await PlatformMigration.findById(req.params.id);
  if(!plan)throw new HttpError(404,'Migration plan missing');
  if(!eligibleForApproval(plan,req.actor!.id))throw new HttpError(409,'Requires another Platform Owner and planned status');
  const updated=await PlatformMigration.findOneAndUpdate({_id:plan._id,status:'planned',requestedBy:{$ne:req.actor!.id}},
    {$set:{status:'approved',approvedAt:new Date(),approvedBy:req.actor!.id}},{new:true});
  if(!updated)throw new HttpError(409,'Plan already changed');
  res.json({id:updated._id,status:updated.status,confirmation});
}));
router.post('/migrations/:id/cancel',wrap(async(req,res)=>{
  await platformOwner(req);
  if(!mongoose.isValidObjectId(req.params.id))throw new HttpError(400,'Invalid plan ID');
  const plan=await PlatformMigration.findOneAndUpdate({_id:req.params.id,status:{$in:['planned','approved']}},
    {$set:{status:'cancelled'}},{new:true});
  if(!plan)throw new HttpError(409,'Only unstarted plans can be cancelled');
  res.json({id:plan._id,status:plan.status});
}));
export default router;
