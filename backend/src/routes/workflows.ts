import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { Task, TaskUpdate, Lead, Project, ApprovalRequest, Membership, User, Expense, Transfer, CapitalMovement, Installment, Student, Receipt, Invoice, JournalEntry, DailyPerformance, TradingAccount, Company, BankAccount } from '../models.js';
import { audit, HttpError, requireCompany, requirePermission, scopedQuery, wrap, can } from '../lib/security.js';
import { D, makeJournal, nonNegativeAmount, positiveAmount } from '../lib/finance.js';
const router = Router();
function validId(id: string) {
    if (!mongoose.isValidObjectId(id))
        throw new HttpError(400, 'Invalid record ID');
    return id;
}
router.get('/tasks/:id/updates', wrap(async (req, res) => {
    const task = await Task.findOne({ _id: validId(req.params.id), $and: [scopedQuery(req, 'operations')] });
    if (!task)
        throw new HttpError(404, 'Task not found');
    res.json(await TaskUpdate.find({ taskId: task._id, companyId: task.companyId }).sort({ createdAt: -1 }).lean());
}));
router.post('/tasks/:id/updates', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'operations');
    const task = await Task.findOne({ _id: validId(req.params.id), companyId, $and: [scopedQuery(req, 'operations')] });
    if (!task)
        throw new HttpError(404, 'Task not found');
    const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(req.body);
    const update = await TaskUpdate.create({ companyId, taskId: task._id, userId: req.actor!.id, message });
    await audit(req, 'task.update', 'tasks', req.params.id, { message }, companyId);
    res.status(201).json(update);
}));
router.post('/leads/:id/convert', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'sales');
    requirePermission(req, 'projects');
    const session = await mongoose.startSession();
    let project: any;
    try {
        await session.withTransaction(async () => {
            const lead = await Lead.findOne({ _id: validId(req.params.id), companyId }).session(session);
            if (!lead)
                throw new HttpError(404, 'Lead not found');
            if (lead.projectId) {
                project = await Project.findById(lead.projectId).session(session);
                return;
            }
            if (lead.stage !== 'won')
                throw new HttpError(409, 'Only won opportunities may be converted');
            [project] = await Project.create([{ title: lead.title, description: lead.description, companyId, createdBy: req.actor!.id, leadId: lead._id, clientId: lead.clientId, budget: lead.amount || '0', status: 'planning', risk: 'on-track' }], { session });
            lead.projectId = project._id;
            await lead.save({ session });
        });
    }
    finally {
        await session.endSession();
    }
    if (!project)
        throw new HttpError(500, 'Conversion did not create a project');
    await audit(req, 'lead.convert', 'leads', req.params.id, { projectId: String(project._id) }, companyId);
    res.json(project);
}));
router.post('/advisory/capital/:id/settle', wrap(async(req,res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'advisory');
    requirePermission(req, 'approvals', 'approve');
    const session = await mongoose.startSession();
    let result: any;
    try {
        await session.withTransaction(async () => {
            const movement = await CapitalMovement.findOne({ _id: validId(req.params.id), companyId, status:'approved' }).session(session);
            if (!movement) throw new HttpError(409,'Movement must be approved and not yet settled');
            const account = await TradingAccount.findOne({ _id: movement.tradingAccountId, companyId }).session(session);
            if (!account) throw new HttpError(404,'Source trading account missing');
            const amount = positiveAmount(movement.amount?.toString());
            if (account.currency !== movement.currency) throw new HttpError(409,'Currency conversion is not configured for this movement');
            const current = D(account.capital?.toString());
            if (movement.direction === 'deposit') account.capital = new mongoose.Types.Decimal128(current.plus(amount).toFixed(2));
            else if (movement.direction === 'withdrawal' || movement.direction === 'transfer') {
                if (current.lt(amount)) throw new HttpError(409,'Insufficient account capital');
                account.capital = new mongoose.Types.Decimal128(current.minus(amount).toFixed(2));
            } else throw new HttpError(400,'Unsupported capital movement direction');
            if (movement.direction === 'transfer') {
                const dest = await TradingAccount.findOne({ _id: movement.destinationTradingAccountId, companyId }).session(session);
                if (!dest || String(dest._id) === String(account._id)) throw new HttpError(409,'Destination trading account missing or invalid');
                if (dest.currency !== movement.currency) throw new HttpError(409,'Accounts must use the same currency');
                dest.capital = new mongoose.Types.Decimal128(D(dest.capital?.toString()).plus(amount).toFixed(2));
                await dest.save({ session });
            }
            await account.save({ session });
            movement.status = 'posted';
            movement.settledAt = new Date();
            result = await movement.save({ session });
        });
    } finally { await session.endSession(); }
    await audit(req,'capital.settle','capitalMovements',req.params.id,{},companyId);
    res.json(result);
}));
router.post('/installments/schedule', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'learning');
    const input = z.object({ studentId: z.string(), title: z.string().min(2), amount: z.union([z.string(), z.number()]), dueAt: z.string() }).parse(req.body);
    validId(input.studentId);
    const amount = positiveAmount(input.amount);
    if (Number.isNaN(new Date(input.dueAt).getTime()))
        throw new HttpError(400, 'Invalid due date');
    const session = await mongoose.startSession();
    let installment: any;
    try {
        await session.withTransaction(async () => {
            const student = await Student.findOne({ _id: input.studentId, companyId }).session(session);
            if (!student)
                throw new HttpError(404, 'Student not found');
            [installment] = await Installment.create([{ title: input.title, companyId, createdBy: req.actor!.id, studentId: student._id, amount: amount.toFixed(2), paidAmount: '0', dueAt: new Date(input.dueAt), status: 'pending' }], { session });
            student.outstanding = new mongoose.Types.Decimal128(D(student.outstanding?.toString()).plus(amount).toFixed(2));
            await student.save({ session });
        });
    }
    finally {
        await session.endSession();
    }
    await audit(req, 'installment.schedule', 'installments', String(installment._id), { amount: amount.toFixed(2) }, companyId);
    res.status(201).json(installment);
}));
router.post('/invoices/:id/collect', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'finance');
    const input = z.object({ amount: z.union([z.string(), z.number()]), reference: z.string().min(2).max(120) }).parse(req.body);
    const a = positiveAmount(input.amount);
    const session = await mongoose.startSession();
    let receipt: any;
    try {
        await session.withTransaction(async () => {
            const invoice = await Invoice.findOne({ _id: validId(req.params.id), companyId }).session(session);
            if (!invoice)
                throw new HttpError(404, 'Invoice not found');
            if (!['posted', 'partial'].includes(invoice.status))
                throw new HttpError(409, 'Post the invoice journal before collecting receipts');
            const newTotal = D(invoice.paidAmount?.toString()).plus(a);
            if (newTotal.gt(D(invoice.amount?.toString())))
                throw new HttpError(409, 'Receipt exceeds invoice balance');
            invoice.paidAmount = new mongoose.Types.Decimal128(newTotal.toFixed(2));
            invoice.status = newTotal.eq(D(invoice.amount?.toString())) ? 'paid' : 'partial';
            if (invoice.status === 'paid')
                invoice.paidAt = new Date();
            await invoice.save({ session });
            [receipt] = await Receipt.create([{ title: `Invoice receipt: ${invoice.number || invoice.title}`, companyId, createdBy: req.actor!.id, invoiceId: invoice._id, amount: a.toFixed(2), currency: invoice.currency || 'INR', receivedAt: new Date(), reference: input.reference, status: 'received' }], { session });
            await JournalEntry.create([{ companyId, referenceType: 'receipts', referenceId: receipt._id, journalNumber: `RC-${receipt._id}`, currency: invoice.currency || 'INR', postedBy: req.actor!.id, lines: makeJournal(a.toFixed(2), 'Bank', 'Accounts Receivable') }], { session });
        });
    }
    finally {
        await session.endSession();
    }
    await audit(req, 'invoice.collect', 'invoices', req.params.id, { receiptId: String(receipt._id), amount: a.toFixed(2) }, companyId);
    res.json(receipt);
}));
router.post('/installments/:id/collect', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'learning');
    const { amount, reference } = z.object({ amount: z.union([z.string(), z.number()]), reference: z.string().min(2).max(120) }).parse(req.body);
    const a = positiveAmount(amount);
    const session = await mongoose.startSession();
    let receipt: any;
    try {
        await session.withTransaction(async () => {
            const item = await Installment.findOne({ _id: validId(req.params.id), companyId }).session(session);
            if (!item?.studentId)
                throw new HttpError(404, 'Installment not found or student missing');
            const remaining = D(item.amount?.toString()).minus(D(item.paidAmount?.toString()));
            if (a.gt(remaining))
                throw new HttpError(409, 'Payment exceeds remaining installment balance');
            const newPaid = D(item.paidAmount?.toString()).plus(a);
            item.paidAmount = new mongoose.Types.Decimal128(newPaid.toFixed(2));
            item.status = newPaid.eq(D(item.amount?.toString())) ? 'paid' : 'partial';
            if (item.status === 'paid')
                item.paidAt = new Date();
            await item.save({ session });
            [receipt] = await Receipt.create([{ title: `Student fee: ${item.title}`, companyId, createdBy: req.actor!.id, studentId: item.studentId, amount: a.toFixed(2), currency: 'INR', status: 'received', reference, receivedAt: new Date() }], { session });
            const entries = await Installment.find({ companyId, studentId: item.studentId }).session(session);
            const outstanding = entries.reduce((sum, v) => sum.plus(D(v.amount?.toString()).minus(D(v.paidAmount?.toString()))), D(0));
            await Student.updateOne({ _id: item.studentId, companyId }, { $set: { outstanding: outstanding.toFixed(2) } }, { session });
        });
    }
    finally {
        await session.endSession();
    }
    await audit(req, 'fee.collect', 'installments', req.params.id, { amount: a.toFixed(2), receiptId: String(receipt._id) }, companyId);
    res.json(receipt);
}));
router.post('/invoices/:id/request-review',wrap(async(req,res)=>{
    const companyId=requireCompany(req);requirePermission(req,'finance');
    const session=await mongoose.startSession();let request:any;
    try{await session.withTransaction(async()=>{
        const invoice=await Invoice.findOne({_id:validId(req.params.id),companyId,status:'draft'}).session(session);
        if(!invoice)throw new HttpError(409,'Only draft invoices can be submitted for review');
        if(!invoice.reviewerIds?.length)throw new HttpError(400,'Choose one or more reviewers in the invoice');
        invoice.status='sent';
        [request]=await ApprovalRequest.create([{title:`Review invoice: ${invoice.title}`,companyId,createdBy:req.actor!.id,requestedBy:req.actor!.id,recordType:'invoices',recordId:invoice._id,amount:invoice.amount,currency:invoice.currency,reviewerIds:invoice.reviewerIds,status:'pending'}],{session});
        invoice.approvalId=request._id;await invoice.save({session});
    });}finally{await session.endSession();}
    await audit(req,'invoice.review-request','invoices',req.params.id,{approvalId:String(request._id)},companyId);res.status(201).json(request);
}));
router.get('/approvals/:id/context',wrap(async(req,res)=>{
    const request=await ApprovalRequest.findOne({ _id:validId(req.params.id),$and:[scopedQuery(req,'approvals')] }).lean();
    if(!request)throw new HttpError(404,'Approval request not found');
    const M:Record<string,any>={expenses:Expense,transfers:Transfer,capitalMovements:CapitalMovement,invoices:Invoice};
    const record=await M[request.recordType]?.findOne({_id:request.recordId,companyId:request.companyId}).lean();
    if(!record)throw new HttpError(404,'Supporting record not found');
    const companies=await Company.find({_id:{$in:[request.companyId,record.targetCompanyId].filter(Boolean)}}).select('name').lean();
    const nameOf=(id:any)=>companies.find(c=>String(c._id)===String(id))?.name||'';
    res.json({sourceModule:request.recordType,recordTitle:record.title,recordStatus:record.status,sourceCompany:nameOf(request.companyId),targetCompany:record.targetCompanyId?nameOf(record.targetCompanyId):undefined,reference:record.reference||record.sourceAccount||'',createdAt:record.createdAt,reviewerCount:request.reviewerIds?.length||0});
}));
// Owner can rescue an approval assigned to its own maker, or an unavailable reviewer.
router.post('/approvals/:id/reassign', wrap(async(req,res)=>{
    const companyId = requireCompany(req);
    requirePermission(req, 'settings', 'admin');
    const input = z.object({ reviewerIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).min(1).max(12) }).parse(req.body);
    const ids = [...new Set(input.reviewerIds)];
    const session = await mongoose.startSession();
    let updated:any;
    try { await session.withTransaction(async()=>{
        const approval = await ApprovalRequest.findOne({_id:validId(req.params.id),companyId,status:'pending'}).session(session);
        if(!approval) throw new HttpError(409,'Pending approval not found');
        if(ids.includes(String(approval.requestedBy))) throw new HttpError(409,'A requester cannot approve their own transaction. Assign a different person.');
        const memberships = await Membership.find({companyId,userId:{$in:ids},active:true,removedAt:{$exists:false}}).session(session);
        const users = await User.find({_id:{$in:ids},active:true}).select('_id').session(session);
        if(memberships.length!==ids.length || users.length!==ids.length || memberships.some(m=>!(m.role==='owner' || (m.role==='team' && m.permissions.includes('approvals:write')))))
            throw new HttpError(400,'Every assignee must be an active member with approval access');
        approval.reviewerIds=ids.map(id=>new mongoose.Types.ObjectId(id));
        updated = await approval.save({session});
        const affected:Record<string,any>={expenses:Expense,transfers:Transfer,capitalMovements:CapitalMovement,invoices:Invoice};
        if(affected[approval.recordType]) await affected[approval.recordType].updateOne({_id:approval.recordId,companyId},{$set:{reviewerIds:approval.reviewerIds}},{session});
    }); } finally {await session.endSession();}
    await audit(req,'approval.reassign','approvals',req.params.id,{reviewerIds:ids},companyId);
    res.json(updated);
}));
router.post('/approvals/:id/decision' , wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'approvals', 'approve');
    const input = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(1000).optional() }).parse(req.body);
    if (input.decision === 'rejected' && !input.reason?.trim())
        throw new HttpError(400, 'Rejection reason is required');
    const session = await mongoose.startSession();
    let updated: any;
    try {
        await session.withTransaction(async () => {
            const request = await ApprovalRequest.findOne({ _id: validId(req.params.id), companyId, status: 'pending' }).session(session);
            if (!request)
                throw new HttpError(409, 'Pending approval not found');
            if (request.reviewerIds?.length && !request.reviewerIds.some((id: any) => String(id) === req.actor!.id))
                throw new HttpError(403, 'This request is assigned to another approver');
            if (String(request.requestedBy) === req.actor!.id)
                throw new HttpError(403, 'Maker cannot approve or reject own request');
            const affected: Record<string, any> = { expenses: Expense, transfers: Transfer, capitalMovements: CapitalMovement, invoices: Invoice };
            const M = affected[request.recordType];
            if (!M)
                throw new HttpError(400, 'Unsupported approval record');
            const affectedResult = await M.updateOne({ _id: request.recordId, companyId, status: request.recordType==='invoices'?'sent':'pending' }, { $set: { status: input.decision } }, { session });
            if (!affectedResult.modifiedCount)
                throw new HttpError(409, 'Target record status is inconsistent');
            request.status = input.decision;
            request.reviewedBy = new mongoose.Types.ObjectId(req.actor!.id);
            request.reviewedAt = new Date();
            request.rejectionReason = input.decision === 'rejected' ? input.reason : '';
            updated = await request.save({ session });
        });
    }
    finally {
        await session.endSession();
    }
    await audit(req, `approval.${input.decision}`, 'approvals', req.params.id, { reason: input.reason }, companyId);
    res.json(updated);
}));
router.post('/finance/post/:entity/:id', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'finance');
    if (!['expenses', 'invoices', 'transfers'].includes(req.params.entity))
        throw new HttpError(400, 'Unsupported financial posting');
    const entity = req.params.entity;
    const M: any = { expenses: Expense, invoices: Invoice, transfers: Transfer }[entity as 'expenses' | 'invoices' | 'transfers'];
    const session = await mongoose.startSession();
    let result: any;
    try {
        await session.withTransaction(async () => {
            const record = await M.findOne({ _id: validId(req.params.id), companyId }).session(session);
            if (!record)
                throw new HttpError(404, 'Finance record not found');
            if (record.status === 'posted')
                throw new HttpError(409, 'Already posted');
            if (entity === 'invoices') {
                if (!['approved', 'sent'].includes(record.status))
                    throw new HttpError(409, 'Invoice must be sent/approved before posting');
                if (record.reviewerIds?.length && record.status!=='approved') throw new HttpError(409,'Assigned invoice reviewers must approve before posting');
            }
            else if (record.status !== 'approved')
                throw new HttpError(409, 'Approval required before posting');
            const amount = positiveAmount(record.amount?.toString()).toFixed(2);
            let entries: Array<{
                companyId: any;
                referenceType: string;
                referenceId: any;
                journalNumber: string;
                currency: string;
                postedBy: any;
                lines: any[];
            }> = [];
            if (entity === 'expenses') {
                entries = [{ companyId, referenceType: entity, referenceId: record._id, journalNumber: `EX-${record._id}`, currency: record.currency || 'INR', postedBy: req.actor!.id, lines: makeJournal(amount, 'Expense', 'Accounts Payable') }];
            }
            else if (entity === 'invoices') {
                entries = [{ companyId, referenceType: entity, referenceId: record._id, journalNumber: `IN-${record._id}`, currency: record.currency || 'INR', postedBy: req.actor!.id, lines: makeJournal(amount, 'Accounts Receivable', 'Sales Revenue') }];
            }
            else {
                const targetCompanyId = String(record.targetCompanyId);
                if (!can(req, targetCompanyId, 'finance', 'write') || targetCompanyId === companyId)
                    throw new HttpError(403, 'Cannot post to an unauthorized destination company');
                entries = [
                    { companyId, referenceType: entity, referenceId: record._id, journalNumber: `TR-OUT-${record._id}`, currency: record.currency || 'INR', postedBy: req.actor!.id, lines: makeJournal(amount, 'Intercompany Receivable', 'Bank') },
                    { companyId: targetCompanyId, referenceType: entity, referenceId: record._id, journalNumber: `TR-IN-${record._id}`, currency: record.currency || 'INR', postedBy: req.actor!.id, lines: makeJournal(amount, 'Bank', 'Intercompany Payable') },
                ];
            }
            result = await JournalEntry.create(entries, { session });
            await M.updateOne({ _id: record._id, companyId, status: record.status }, { $set: { status: 'posted', ...(entity === 'transfers' ? { postedAt: new Date() } : {}) } }, { session });
        });
    }
    finally {
        await session.endSession();
    }
    await audit(req, 'finance.post', entity, req.params.id, { journals: result.map((v: any) => String(v._id)) }, companyId);
    res.json({ journalEntries: result });
}));
router.get('/finance/journals', wrap(async (req, res) => {
    const companies = (req.companyIds || []).filter(id => can(req, id, 'finance'));
    if (!companies.length)
        throw new HttpError(403, 'Finance permission required');
    res.json(await JournalEntry.find({ companyId: { $in: companies } }).sort({ postedAt: -1 }).limit(200).lean());
}));
router.post('/advisory/import-performance', wrap(async (req, res) => {
    const companyId = requireCompany(req);
    requirePermission(req, 'advisory');
    const input = z.object({ tradingAccountId: z.string(), csv: z.string().max(3000000) }).parse(req.body);
    if (!mongoose.isValidObjectId(input.tradingAccountId))
        throw new HttpError(400, 'Invalid trading account');
    const account = await TradingAccount.findOne({ _id: input.tradingAccountId, companyId });
    if (!account)
        throw new HttpError(404, 'Trading account not found');
    const rows = parse(input.csv, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
    if (rows.length > 1000)
        throw new HttpError(400, 'Import batch limited to 1000 rows');
    let imported = 0, duplicates = 0;
    const failures: string[] = [];
    for (const [i, row] of rows.entries()) {
        try {
            const key = row.sourceKey?.trim();
            if (!key)
                throw new Error('Missing sourceKey');
            if (!row.date || isNaN(new Date(row.date).getTime()))
                throw new Error('Invalid date');
            const real = D(row.realizedPnL), unreal = D(row.unrealizedPnL || 0), fees = nonNegativeAmount(row.fees || 0);
            if (![real, unreal, fees].every(x => x.isFinite()))
                throw new Error('Invalid monetary value');
            const update = await DailyPerformance.updateOne({ companyId, tradingAccountId: account._id, sourceKey: key }, { $setOnInsert: { companyId, createdBy: req.actor!.id, tradingAccountId: account._id, sourceKey: key, title: `${account.title}: ${row.date}`, performanceDate: new Date(row.date), realizedPnL: real.toFixed(2), unrealizedPnL: unreal.toFixed(2), fees: fees.toFixed(2), status: 'pending-reconciliation' } }, { upsert: true });
            if (update.upsertedCount)
                imported++;
            else
                duplicates++;
        }
        catch (err: any) {
            failures.push(`Row ${i + 2}: ${err.message}`);
        }
    }
    await audit(req, 'advisory.import', 'dailyPerformance', undefined, { imported, duplicates, errors: failures.length }, companyId);
    res.json({ imported, duplicates, errors: failures });
}));
export default router;
