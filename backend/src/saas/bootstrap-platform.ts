import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models.js';
import { PlatformOperator } from './models.js';
const email=(process.env.PLATFORM_OPERATOR_EMAIL||'').trim().toLowerCase();
const level=process.env.PLATFORM_OPERATOR_LEVEL==='owner'?'owner':'operator';
if(!email)throw new Error('Set PLATFORM_OPERATOR_EMAIL to an existing, MFA-enabled user email');
await mongoose.connect(process.env.MONGODB_URI||'');
try{
  const user=await User.findOne({email,active:true});
  if(!user||!user.mfaEnabled)throw new Error('Existing active account with verified MFA required');
  if(!process.argv.includes('--apply')){
    console.log(`DRY RUN: would grant Platform ${level} to ${email}. Re-run with -- --apply`);
  }else{
    await PlatformOperator.findOneAndUpdate({userId:user._id},
      {$set:{userId:user._id,active:true,level}},{upsert:true});
    user.sessionVersion++;await user.save();
    console.log(`Platform ${level} enabled for ${email}. All previous sessions revoked.`);
  }
}finally{await mongoose.disconnect();}
