import mongoose, { Schema } from 'mongoose';
const options = { timestamps:true } as const;
export const Tenant = mongoose.model('Tenant',new Schema({
  name:{type:String,required:true,trim:true},
  defaultLocale:{type:String,enum:['en','ar'],default:'en'},
  themeId:{type:String,enum:['violet','ocean','emerald','sunset','slate'],default:'violet'},
  slug:{type:String,required:true,lowercase:true,trim:true,unique:true,match:/^[a-z0-9-]{2,80}$/},
  subdomain:{type:String,lowercase:true,trim:true,match:/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/},
  status:{type:String,enum:['active','suspended','archived'],default:'active'},
  planId:{type:Schema.Types.ObjectId},
  primaryContactEmail:{type:String,lowercase:true,trim:true},
  createdBy:{type:Schema.Types.ObjectId},
  retentionUntil:{type:Date},
},options));
Tenant.schema.index({subdomain:1},{unique:true,partialFilterExpression:{subdomain:{$type:'string'}}});
export const TenantMembership = mongoose.model('TenantMembership',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,ref:'Tenant'},
  userId:{type:Schema.Types.ObjectId,required:true,ref:'User'},
  role:{type:String,enum:['super_admin','member'],required:true},
  active:{type:Boolean,default:true},
},options));
TenantMembership.schema.index({tenantId:1,userId:1},{unique:true});
export const PlatformOperator = mongoose.model('PlatformOperator',new Schema({
  userId:{type:Schema.Types.ObjectId,required:true,unique:true,ref:'User'},
  active:{type:Boolean,default:true},
  level:{type:String,enum:['owner','operator','billing','support'],default:'operator'},
},options));
export const SaaSPlan = mongoose.model('SaaSPlan',new Schema({
  code:{type:String,required:true,unique:true},name:{type:String,required:true},
  maxCompanies:{type:Number,default:3,min:1},maxUsers:{type:Number,default:10,min:1},
  storageLimitBytes:{type:Number,default:5368709120,min:0},aiMonthlyCredits:{type:Number,default:0,min:0},
  monthlyPriceMinor:{type:Number,default:0,min:0},currency:{type:String,default:'INR'},
  enabledModules:[String],active:{type:Boolean,default:true},
},options));
export const SaaSSubscription = mongoose.model('SaaSSubscription',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,unique:true,ref:'Tenant'},
  planId:{type:Schema.Types.ObjectId,ref:'SaaSPlan'},
  status:{type:String,enum:['trialing','active','past_due','cancelled','suspended'],default:'trialing'},
  currentPeriodEnd:Date,provider:{type:String,enum:['manual','razorpay','stripe'],default:'manual'},
  providerSubscriptionId:String,providerCustomerId:String,
},options));
export const ImportBatch = mongoose.model('ImportBatch',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,index:true}, companyId:{type:Schema.Types.ObjectId,required:true},
  createdBy:{type:Schema.Types.ObjectId,required:true},entity:{type:String,required:true},
  status:{type:String,enum:['completed','failed'],default:'completed'},
  importedCount:{type:Number,default:0},failedCount:{type:Number,default:0},errors:[{row:Number,error:String}],
  inputDigest:{type:String,required:true},
},options));
export const ExportAudit = mongoose.model('ExportAudit',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,index:true},companyId:Schema.Types.ObjectId,
  requestedBy:{type:Schema.Types.ObjectId,required:true},createdAt:{type:Date,default:Date.now},
  purpose:{type:String,required:true},scope:{type:String,enum:['tenant','company'],required:true},
  status:{type:String,enum:['started','completed','failed'],default:'started'},
  recordCounts:{type:Schema.Types.Mixed},fileCount:Number,error:String,
}));
export const AiUsage = mongoose.model('AiUsage',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,index:true},userId:Schema.Types.ObjectId,
  companyId:Schema.Types.ObjectId,feature:String,model:String,
  inputTokens:{type:Number,default:0},outputTokens:{type:Number,default:0},
  createdAt:{type:Date,default:Date.now},
}));
export const SupportGrant = mongoose.model('SupportGrant',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,index:true},operatorUserId:{type:Schema.Types.ObjectId,required:true},
  grantedBy:{type:Schema.Types.ObjectId,required:true},reason:{type:String,required:true},
  expiresAt:{type:Date,required:true},revokedAt:Date,scope:[String],
},options));
export const TenantInvitation = mongoose.model('TenantInvitation',new Schema({
  tenantId:{type:Schema.Types.ObjectId,required:true,index:true},
  email:{type:String,required:true,lowercase:true},
  tokenHash:{type:String,required:true,unique:true},
  role:{type:String,enum:['super_admin','member'],default:'super_admin'},
  expiresAt:{type:Date,required:true},claimedAt:Date,createdBy:Schema.Types.ObjectId,
},options));
TenantInvitation.schema.index({expiresAt:1},{expireAfterSeconds:604800});

/** Audits platform actions independently of tenant business data. */
export const PlatformAudit = mongoose.model('PlatformAudit',new Schema({
  operatorId:{type:Schema.Types.ObjectId,required:true},tenantId:Schema.Types.ObjectId,
  action:{type:String,required:true},details:{type:Schema.Types.Mixed},
  occurredAt:{type:Date,default:Date.now}
}));
PlatformAudit.schema.index({tenantId:1,occurredAt:-1});

/** Platform appearance & operational contacts are independent of any customer workspace. */
export const PlatformSetting = mongoose.model('PlatformSetting', new Schema({
  key:{type:String,required:true,unique:true,default:'global'},
  platformName:{type:String,required:true,default:'Bitstek Workspace Platform'},
  supportEmail:{type:String,default:''},
  defaultLocale:{type:String,enum:['en','ar'],default:'en'},
  defaultTheme:{type:String,enum:['violet','ocean','emerald','sunset','slate'],default:'violet'},
},options));
