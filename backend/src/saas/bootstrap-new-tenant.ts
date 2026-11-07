/** First-run bootstrap for an EMPTY database only; separate from v5.7 migration. */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Company, WorkspaceSetting } from '../models.js';
import { Tenant, TenantMembership, SaaSPlan, SaaSSubscription } from './models.js';
import { runWithTenant } from './tenant-context.js';
const email=(process.env.BOOTSTRAP_EMAIL||'').trim().toLowerCase();
const password=process.env.BOOTSTRAP_PASSWORD||'';
const slug=(process.env.BOOTSTRAP_TENANT_SLUG||'my-workspace').toLowerCase();
if(!email.includes('@')||password.length<16||!/^[a-z0-9-]{2,80}$/.test(slug))
  throw new Error('Set valid BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD (16+ characters) and BOOTSTRAP_TENANT_SLUG');
await mongoose.connect(process.env.MONGODB_URI||'');
try {
  if(await Tenant.exists({})||await User.exists({}))throw new Error('Bootstrap allowed only on a completely empty installation. For v5.7 use migrate:saas');
  if(!process.argv.includes('--apply')){
    console.log(`DRY RUN: would create first tenant ${slug} and administrator ${email}; run with --apply`);
  } else {
    const session=await mongoose.startSession();
    try{
      await session.withTransaction(async()=>{
        const [tenant]=await Tenant.create([{name:slug,slug,status:'active',primaryContactEmail:email}],{session});
        const tid=String(tenant._id);
        const [user]=await User.create([{name:'Workspace Super Admin',email,active:true,
          passwordHash:await bcrypt.hash(password,12)}],{session});
        await TenantMembership.create([{tenantId:tenant._id,userId:user._id,role:'super_admin',active:true}],{session});
        const [plan]=await SaaSPlan.create([{code:'new-install-internal',name:'Initial Internal Plan',
          maxCompanies:10,maxUsers:50,storageLimitBytes:10737418240,aiMonthlyCredits:0,
          monthlyPriceMinor:0,currency:'INR',active:true}],{session});
        await SaaSSubscription.create([{tenantId:tenant._id,planId:plan._id,status:'active',provider:'manual'}],{session});
        await runWithTenant(tid,async()=>{
          await Company.create([{name:'Primary Company',code:'PRIMARY',vertical:'General Business',currency:'INR',
            enabledModules:['operations','sales','finance','approvals','reports']}],{session});
          await WorkspaceSetting.create([{key:'workspace',name:slug}],{session});
        });
      });
      console.log('Initial tenant created. Sign in, enable MFA, then separately bootstrap Platform Operator if authorized.');
    }finally{await session.endSession();}
  }
}finally{await mongoose.disconnect();}
