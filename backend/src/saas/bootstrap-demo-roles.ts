/** Optional DEVELOPMENT-ONLY test accounts. No static or shared passwords. */
import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {User,Company,Membership} from '../models.js';
import {Tenant,TenantMembership} from './models.js';
import {runWithTenant} from './tenant-context.js';

if(process.env.NODE_ENV!=='development'||process.env.DEMO_BOOTSTRAP_CONFIRM!=='CREATE_DISPOSABLE_ACCOUNTS')
  throw new Error('Refusing demo identities outside explicit development mode');
if(!process.argv.includes('--apply')){
  console.log('DRY RUN: creates 4 random-password development accounts on the first company of Bitstek tenant. Run --apply explicitly.');
  process.exit(0);
}
await mongoose.connect(process.env.MONGODB_URI||'');
try {
  const tenant=await Tenant.findOne({slug:process.env.SAAS_INITIAL_TENANT_SLUG||'bitstek'}).lean();
  if(!tenant)throw new Error('Bitstek tenant not found. Run the existing-data adoption migration first');
  const companies=await runWithTenant(String(tenant._id),()=>Company.find({active:true}).select('_id enabledModules').lean());
  if(!companies.length)throw new Error('Create a company before provisioning roles');
  const company=companies[0];
  const roles=[
    {email:'platform-owner-demo@bitstek.local',name:'Platform Owner candidate',tenantRole:'super_admin',companyRole:'owner'},
    {email:'tenant-superadmin-demo@bitstek.local',name:'Tenant Super Admin demo',tenantRole:'super_admin',companyRole:'owner'},
    {email:'company-owner-demo@bitstek.local',name:'Company Owner demo',tenantRole:'member',companyRole:'owner'},
    {email:'team-demo@bitstek.local',name:'Team Member demo',tenantRole:'member',companyRole:'team'}
  ];
  const exists=await User.countDocuments({email:{$in:roles.map(r=>r.email)}});
  if(exists)throw new Error('Some demo accounts already exist; no passwords were reset. Use account recovery instead');
  for(const role of roles){
    const password=crypto.randomBytes(24).toString('base64url');
    const user=await User.create({name:role.name,email:role.email,passwordHash:await bcrypt.hash(password,12),active:true});
    await TenantMembership.create({tenantId:tenant._id,userId:user._id,role:role.tenantRole,active:true});
    const enabled=await runWithTenant(String(tenant._id),()=>Company.findById(company._id).lean());
    const access=role.companyRole==='team'?[...(enabled?.enabledModules||['operations']).slice(0,2)].flatMap(x=>[`${x}:read`,`${x}:write`]):[];
    await runWithTenant(String(tenant._id),()=>Membership.create({tenantId:tenant._id,companyId:company._id,
      userId:user._id,role:role.companyRole,permissions:access,active:true}));
    console.log(`ONE-TIME DEVELOPMENT CREDENTIAL: ${role.email} / ${password} / workspace ${tenant.slug}`);
  }
  console.log('NEXT: login as platform-owner-demo, enroll and verify MFA, then bootstrap platform role using PLATFORM_OPERATOR_EMAIL and PLATFORM_OPERATOR_LEVEL=owner.');
  console.log('Never run these test accounts against production or share these generated passwords.');
} finally {await mongoose.disconnect();}
