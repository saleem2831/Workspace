import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose, { Schema } from 'mongoose';

/** All customer-owned models are constrained by a verified session tenant. */
const context = new AsyncLocalStorage<{ tenantId: string }>();
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  if (!mongoose.isValidObjectId(tenantId)) throw new Error('Invalid tenant context');
  return context.run({ tenantId }, fn);
}
export function currentTenant(): string {
  const tenantId = context.getStore()?.tenantId;
  if (!tenantId) throw new Error('Tenant context missing: tenant-scoped access denied');
  return tenantId;
}

/**
 * Fail-closed Mongoose scope. Using a schema wrapper makes it easy to audit
 * which models contain customer data. Platform control models are separate.
 * Direct MongoDB driver access is reserved for reviewed migrations only.
 */
export function tenantSchema(fields: Record<string, any>, options: any = {}) {
  const schema = new Schema({ tenantId: { type: Schema.Types.ObjectId, required: true, index: true }, ...fields }, options);
  const readOps = ['find','findOne','countDocuments','estimatedDocumentCount','distinct',
    'updateOne','updateMany','findOneAndUpdate','replaceOne','findOneAndReplace',
    'deleteOne','deleteMany','findOneAndDelete'] as const;
  for (const op of readOps) {
    schema.pre(op as any, function(this: any) {
      const tenantId = currentTenant();
      if (op === 'estimatedDocumentCount') throw new Error('Unscoped count is not permitted');
      this.setQuery({ $and: [this.getQuery(), { tenantId: new mongoose.Types.ObjectId(tenantId) }] });
      if (['updateOne','updateMany','findOneAndUpdate','replaceOne','findOneAndReplace'].includes(op)) {
        const update = this.getUpdate() || {};
        // Tenant ownership must be immutable. Reject any client attempt to
        // change it, including replacement documents.
        if ('tenantId' in update || '$set' in update && 'tenantId' in update.$set ||
            '$unset' in update && 'tenantId' in update.$unset) throw new Error('tenantId cannot be changed');
        if (this.getOptions().upsert) {
          update.$setOnInsert = { ...update.$setOnInsert, tenantId: new mongoose.Types.ObjectId(tenantId) };
          this.setUpdate(update);
        }
      }
    });
  }
  schema.pre('validate', function(this: any) {
    const tenantId = currentTenant();
    if (this.tenantId && String(this.tenantId) !== tenantId) throw new Error('Tenant mismatch on write');
    this.tenantId = new mongoose.Types.ObjectId(tenantId);
  });
  schema.pre('aggregate', function(this: any) {
    const tid = currentTenant();
    const stages = this.pipeline();
    if (stages.some((step: any) => '$lookup' in step || '$unionWith' in step || '$out' in step || '$merge' in step))
      throw new Error('Cross-collection aggregation requires a reviewed tenant-safe implementation');
    // Geo/other first-stage restrictions should be reviewed before introducing those stages.
    stages.unshift({ $match: { tenantId: new mongoose.Types.ObjectId(tid) } });
  });
  return schema;
}
