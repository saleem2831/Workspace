import 'dotenv/config';
import mongoose from 'mongoose';
import { Company } from '../models.js';
import { modulesForVertical } from '../lib/company-modules.js';
const dry=process.argv.includes('--dry-run');
const uri=process.env.MONGODB_URI;
if(!uri)throw new Error('Set MONGODB_URI in backend/.env before migration');
await mongoose.connect(uri);
try {
  const legacy=await Company.find({enabledModules:{$exists:false}});
  console.log(`${dry?'DRY RUN':'MIGRATION'}: ${legacy.length} company module configurations to initialize`);
  for(const company of legacy){
    const modules=modulesForVertical(company.vertical);
    console.log(`${company.code} (${company.vertical||'General'}): ${modules.join(', ')}`);
    if(!dry)await Company.updateOne({_id:company._id,enabledModules:{$exists:false}},{$set:{enabledModules:modules}});
  }
  console.log(dry?'No changes made.':'Completed; existing user roles, MFA and business records preserved.');
}finally{await mongoose.disconnect();}
