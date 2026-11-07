/** Additive migration for v4 databases. Use a backup; safe to repeat. No financial data is erased. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config, validateConfig } from '../config.js';
import { Event, Invoice, Membership, User } from '../models.js';
validateConfig();
await mongoose.connect(config.mongoUri,{serverSelectionTimeoutMS:10000});
try {
 const events = await Event.updateMany({status:'scheduled'},{$set:{status:'active'}});
 const invoices = await Invoice.find({reviewerId:{$exists:true,$ne:null},'reviewerIds.0':{$exists:false}});
 let backfilled=0;
 for(const invoice of invoices){invoice.reviewerIds=[invoice.reviewerId];await invoice.save();backfilled++;}
 // Legacy finance_head becomes team role with explicit Finance/Approvals permissions.
 const memberships = await Membership.updateMany({role:'finance_head'},{$set:{role:'team',permissions:['finance:write','approvals:write','reports:read']}});
 console.log(`v5 migration: ${events.modifiedCount} calendar statuses, ${backfilled} invoice reviewers, ${memberships.modifiedCount} legacy finance roles`);
 if(process.env.ALLOW_SUPERADMIN_BOOTSTRAP==='true'){
  const email=(process.env.SUPERADMIN_EMAIL||'').trim().toLowerCase();
  if(!email)throw new Error('SUPERADMIN_EMAIL required when ALLOW_SUPERADMIN_BOOTSTRAP=true');
  const owner=await User.findOne({email,active:true});
  if(!owner)throw new Error('Super admin user does not exist');
  const ownerMemberships=await Membership.countDocuments({userId:owner._id,role:'owner',active:true});
  if(ownerMemberships===0)throw new Error('Super admin bootstrap target must already be a company owner');
  await User.updateOne({_id:owner._id},{$set:{isSuperAdmin:true}});
  console.log(`Workspace super administrator assigned to ${owner.email} by explicit operator request.`);
 }
}finally{await mongoose.disconnect();}
