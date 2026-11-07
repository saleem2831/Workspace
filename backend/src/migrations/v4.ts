/** Safe, additive v4 migration. Never creates duplicate installments. Requires replica-set MongoDB. */
import mongoose from 'mongoose';
import { config, validateConfig } from '../config.js';
import { Student, Installment } from '../models.js';
import { D } from '../lib/finance.js';
validateConfig();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
let created = 0, unchanged = 0;
try {
  const cursor = Student.find({ status: { $ne:'archived' } }).cursor();
  for await (const student of cursor) {
    const amount = D(student.totalFees?.toString());
    if (amount.lte(0)) { unchanged++;continue; }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async() => {
        const exists = await Installment.exists({ studentId:student._id,companyId:student.companyId }).session(session);
        if (exists) { unchanged++;return; }
        const record = await Student.findById(student._id).session(session);
        if (!record) return;
        await Installment.create([{ companyId:record.companyId,studentId:record._id,createdBy:record.createdBy,title:`Course fee: ${record.title}`,amount:amount.toFixed(2),paidAmount:'0',status:'pending',dueAt:new Date() }],{session});
        record.outstanding = new mongoose.Types.Decimal128(amount.toFixed(2));
        await record.save({session});
        created++;
      });
    } finally {await session.endSession();}
  }
  console.log(`v4 migration complete; new initial fee schedules: ${created}; unchanged: ${unchanged}`);
} finally {await mongoose.disconnect();}
