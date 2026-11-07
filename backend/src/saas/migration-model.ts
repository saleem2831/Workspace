import mongoose, { Schema } from 'mongoose';

/** Platform-control metadata only: no credentials, URI, or S3 keys stored here. */
const migrationSchema = new Schema({
  kind: {type:String, enum:['database','storage'], required:true},
  sourceLabel:{type:String, required:true}, targetLabel:{type:String, required:true},
  reason:{type:String,required:true, maxlength:1000},
  status:{type:String,enum:['planned','approved','running','verified','failed','cancelled'],default:'planned'},
  requestedBy:{type:Schema.Types.ObjectId,required:true,ref:'User'},
  approvedBy:{type:Schema.Types.ObjectId,ref:'User'}, approvedAt:Date,
  startedAt:Date,finishedAt:Date,
  report:{type:Schema.Types.Mixed}, errorSummary:String,
},{timestamps:true});
migrationSchema.index({kind:1,createdAt:-1});
export const PlatformMigration = mongoose.model('PlatformMigration',migrationSchema);

export {MIGRATION_CONFIRM,safeLabel,eligibleForApproval,eligibleForExecution} from './migration-policy.js';
