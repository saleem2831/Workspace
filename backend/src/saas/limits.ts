import mongoose from 'mongoose';
import { SaaSPlan, SaaSSubscription } from './models.js';
import { Company, Membership, StoredFile } from '../models.js';
import { HttpError } from '../lib/security.js';

export async function activePlan(tenantId:string) {
  const subscription=await SaaSSubscription.findOne({tenantId}).lean();
  if (!subscription || !['active','trialing'].includes(subscription.status))
    throw new HttpError(402,'Workspace subscription is not active');
  if(subscription.status==='trialing'&&subscription.currentPeriodEnd&&new Date(subscription.currentPeriodEnd)<new Date())
    throw new HttpError(402,'Trial expired: contact workspace billing administrator');
  const plan=await SaaSPlan.findById(subscription.planId).lean();
  if (!plan || !plan.active)throw new HttpError(402,'Subscription plan unavailable');
  return plan;
}
export async function ensureCompanyQuota(tenantId:string) {
  const plan=await activePlan(tenantId);
  const count=await Company.countDocuments({tenantId,active:true});
  if(count>=plan.maxCompanies)throw new HttpError(409,`Plan supports up to ${plan.maxCompanies} active companies`);
}
export async function ensureUserQuota(tenantId:string,userId?:string) {
  const plan=await activePlan(tenantId);
  const existingIds=await Membership.distinct('userId',{tenantId,active:true,removedAt:{$exists:false}});
  if(userId && existingIds.some(x=>String(x)===userId))return;
  if(existingIds.length>=plan.maxUsers)throw new HttpError(409,`Plan supports up to ${plan.maxUsers} company members`);
}

/** Best-effort quota check; atomic reservations are required for heavy concurrent SaaS uploads. */
export async function ensureStorageQuota(tenantId:string,newBytes:number){
  const plan=await activePlan(tenantId);
  const result=await StoredFile.aggregate([{$match:{tenantId:new mongoose.Types.ObjectId(tenantId)}},{$group:{_id:null,bytes:{$sum:'$size'}}}]);
  const used=Number(result[0]?.bytes||0);
  if(used+newBytes>plan.storageLimitBytes)throw new HttpError(413,'Workspace storage quota reached');
}
