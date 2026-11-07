/**
 * One-time, reviewable v5.7 -> v6.1 Bitstek tenant adoption.
 * Default is DRY RUN. Never run --apply without a tested off-site backup.
 * This script uses the native MongoDB driver so existing records can be
 * backfilled before the runtime tenant-scoping schema becomes mandatory.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Tenant, TenantMembership, SaaSPlan, SaaSSubscription } from '../saas/models.js';

const uri=process.env.MONGODB_URI;
if(!uri)throw new Error('Set MONGODB_URI');
const slug=process.env.SAAS_INITIAL_TENANT_SLUG||'bitstek';
if(!/^[a-z0-9-]{2,80}$/.test(slug))throw new Error('Invalid initial tenant slug');
const apply=process.argv.includes('--apply');
await mongoose.connect(uri);
try{
  const db=mongoose.connection.db!;
  const existingTenant=await Tenant.findOne({slug});
  const tenants=await Tenant.countDocuments();
  if(tenants>0&&!existingTenant)throw new Error('Other tenants already exist; manual tenant reconciliation required');
  const legacy=await db.collection('companies').countDocuments({tenantId:{$exists:false}});
  const users=await db.collection('users').find({active:true}).project({_id:1,isSuperAdmin:1,email:1}).toArray();
  const sysUsers=users.filter(u=>u.isSuperAdmin===true);
  if(!sysUsers.length)throw new Error('No legacy Super Admin; manual identity verification required');
  const collections=await db.listCollections().toArray();
  const customerModels=['workspacesettings','companies','memberships','tasks','taskupdates','mentors','traders',
  'vendors','events','students','courses','batches','installments','internships','tradingaccounts','dailyperformances',
  'capitalmovements','usdttransactions','clients','leads','proposals','products','subscriptions','projects','milestones',
  'invoices','expenses','transfers','receipts','approvalrequests','storedfiles','journalentries','auditlogs','bankaccounts'];
  const found=new Set(collections.map(c=>c.name));
  const counts:Record<string,number>={};
  for(const c of customerModels)if(found.has(c))counts[c]=await db.collection(c).countDocuments({tenantId:{$exists:false}});
  console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',slug,existingTenantId:existingTenant?._id,
    legacyCompanyCount:legacy,legacySuperAdmins:sysUsers.map(u=>u.email),unscopedCollections:counts},null,2));
  if(!apply){console.log('No records modified. Back up and run npm run migrate:saas:apply when ready.');process.exit(0);}
  const tenant=existingTenant||await Tenant.create({slug,name:'Bitstek Workspace',status:'active',
    primaryContactEmail:sysUsers[0].email,createdBy:sysUsers[0]._id});
  const tid=tenant._id;
  // Backfill idempotently; never overwrite records already owned by another tenant.
  for(const name of customerModels){if(!found.has(name))continue;
    const result=await db.collection(name).updateMany({tenantId:{$exists:false}},{$set:{tenantId:tid}});
    if(result.modifiedCount)console.log(`${name}: assigned ${result.modifiedCount} records`);
  }
  const membershipUserIds=found.has('memberships')?await db.collection('memberships').distinct('userId',{tenantId:tid}):[];
  const ids=new Set([...membershipUserIds.map(String),...sysUsers.map(u=>String(u._id))]);
  for(const id of ids){
    const isSuper=sysUsers.some(u=>String(u._id)===id);
    await TenantMembership.findOneAndUpdate({tenantId:tid,userId:new mongoose.Types.ObjectId(id)},
      {$set:{role:isSuper?'super_admin':'member',active:true}},{upsert:true});
  }
  let plan=await SaaSPlan.findOne({code:'internal-bitstek'});
  if(!plan)plan=await SaaSPlan.create({code:'internal-bitstek',name:'Internal Bitstek',
    maxCompanies:100,maxUsers:500,storageLimitBytes:107374182400,aiMonthlyCredits:5000,
    monthlyPriceMinor:0,currency:'INR'});
  await SaaSSubscription.findOneAndUpdate({tenantId:tid},
    {$setOnInsert:{planId:plan._id,status:'active',provider:'manual'}},{upsert:true});
  console.log('Tenant migration applied; verify tenant data and user access before public deployment.');
  console.log('INDEX ACTION REQUIRED: review/drop legacy global Company.code and WorkspaceSetting.key indexes, then create tenant compound indexes. See MIGRATION_STEPS.md.');
}finally{await mongoose.disconnect();}
