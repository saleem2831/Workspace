/**
 * One-time, idempotent company-role migration from v5.4 to v5.5.
 * BACK UP MongoDB first. No user, assignment, historical or financial records are deleted.
 * This does NOT alter the workspace Super Admin flag on User.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config, validateConfig } from '../config.js';
import { Membership, User } from '../models.js';
import { KNOWN_LEGACY_ROLES, migrateMembershipRole } from '../lib/role-migration.js';

async function main() {
  validateConfig();
  await mongoose.connect(config.mongoUri,{serverSelectionTimeoutMS:10000});
  try {
    const entries = await Membership.find({role:{$nin:['owner','team']}}).lean();
    const dryRun=process.argv.includes('--dry-run');
    if(dryRun) {
      console.log('DRY RUN only: ' + entries.length + ' legacy memberships found.');
      console.log(JSON.stringify(entries.reduce((acc:Record<string,number>,entry)=>{acc[entry.role]=(acc[entry.role]||0)+1;return acc;},{}),null,2));
      return;
    }
    let migrated=0;
    const users=new Set<string>();
    for(const entry of entries){
      const result=migrateMembershipRole(entry.role,entry.permissions||[]);
      const updated=await Membership.updateOne({_id:entry._id,role:entry.role},{$set:result});
      if(updated.modifiedCount){migrated++; users.add(String(entry.userId));}
    }
    if(users.size) await User.updateMany({_id:{$in:[...users]}},{$inc:{sessionVersion:1}});
    const unknown = entries.filter(x=>!KNOWN_LEGACY_ROLES.includes(x.role));
    console.log(`v5.5 roles migrated: ${migrated}; users requiring fresh login: ${users.size}; legacy roles needing review: ${unknown.length}`);
    if(unknown.length) console.warn('Review unknown roles in Team & Access; these accounts receive no module permissions.');
  } finally { await mongoose.disconnect(); }
}
await main();
