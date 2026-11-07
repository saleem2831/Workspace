import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { models, TaskUpdate, ApprovalRequest, Membership, Student, Installment, Batch, Client, Lead, StoredFile, Product, UsdtTransaction, BankAccount, Project, Company, AuditLog } from '../models.js';
import { audit, can, HttpError, moduleOf, requireCompany, requirePermission, scopedQuery, wrap, allowedCompanies } from '../lib/security.js';
import { calculateUsdtSale } from '../lib/usdt.js';
import { addCalendarMonths } from '../lib/dates.js';
import { D, nonNegativeAmount, positiveAmount } from '../lib/finance.js';
const router = Router();
const statuses: Record<string, string[]> = {
    tasks: ['backlog', 'ready', 'in-progress', 'waiting', 'review', 'completed'],
    leads: ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'],
    projects: ['planning', 'in-progress', 'on-hold', 'completed', 'cancelled'],
    approvals: ['pending', 'approved', 'rejected', 'paid'],
    expenses: ['draft', 'pending', 'approved', 'rejected', 'posted', 'paid'],
    transfers: ['draft', 'pending', 'approved', 'rejected', 'posted'],
    invoices: ['draft', 'sent', 'approved', 'posted', 'partial', 'paid'],
};
const controlled = new Set(['expenses', 'transfers', 'capitalMovements', 'approvals', 'receipts', 'installments']);
const positiveMoneyEntities = new Set(['invoices', 'expenses', 'transfers', 'capitalMovements']);
const moneyFields = new Set(['amount', 'fee', 'price', 'budget', 'stipend', 'capital', 'totalFees']);
const restrictedFields = new Set(['_id', 'tenantId', 'companyId', 'createdBy', 'updatedAt', 'createdAt', '__v', 'approvalId', 'postedAt', 'paidAt', 'paidAmount', 'reviewedBy', 'reviewedAt', 'requestedBy', 'recordType', 'recordId', 'completedAt', 'outstanding']);
function modelFor(entity: string) {
    if (!(entity in models))
        throw new HttpError(404, 'Unknown module');
    return (models as any)[entity] as mongoose.Model<any>;
}
function checkId(id: string) {
    if (!mongoose.isValidObjectId(id))
        throw new HttpError(400, 'Invalid record ID');
    return id;
}
const references: Record<string, string> = { sourceBankAccountId: 'bankAccounts', targetBankAccountId: 'bankAccounts', mentorId: 'mentors', traderId: 'traders', vendorId: 'vendors', destinationTradingAccountId: 'tradingAccounts',  courseId: 'courses', batchId: 'batches', studentId: 'students', tradingAccountId: 'tradingAccounts', clientId: 'clients', productId: 'products', leadId: 'leads', projectId: 'projects' };
function canAccessTarget(req:any,companyId:string){return can(req,companyId,'finance','write');}
async function validateRelations(input: Record<string, any>, companyId: string, req: any, entity: string) {
    for (const [field, collection] of Object.entries(references)) {
        const id = input[field];
        if (!id)
            continue;
        if (!mongoose.isValidObjectId(String(id)))
            throw new HttpError(400, `Invalid ${field}`);
        const related = (models as any)[collection] as mongoose.Model<any>;
        const targetCompany = field === 'targetBankAccountId' ? String(input.targetCompanyId || '') : companyId;
        // Companies can use the same modules, but their client/project data
        // is isolated. Only explicit intercompany transfers cross boundaries.
        const match = { _id:id, companyId: targetCompany };
        if (field === 'targetBankAccountId' && (!targetCompany || !canAccessTarget(req,targetCompany))) throw new HttpError(403,'Target account company is not authorized');
        if (!await related.exists(match))
            throw new HttpError(400, `${field} must refer to a record in this company`);
    }
    for (const name of ['offerLetterFileId', 'certificateFileId', 'documentFileId', 'supportingFileId']) {
        if (input[name]) {
            if (!mongoose.isValidObjectId(String(input[name])) || !await StoredFile.exists({ _id: input[name], companyId, purpose: name }))
                throw new HttpError(400, `Invalid or unauthorized ${name}`);
        }
    }
    for (const field of ['assigneeIds']) {
        if (input[field] !== undefined) {
            if (!Array.isArray(input[field]) || input[field].length > 30) throw new HttpError(400, 'Invalid assignee list');
            for (const id of input[field]) if (!mongoose.isValidObjectId(String(id)) || !await Membership.exists({ userId:id, companyId, active:true })) throw new HttpError(400,'Assignee must belong to the company');
        }
    }
    if (Array.isArray(input.reviewerIds)) {
        for (const id of input.reviewerIds) {
            if (!mongoose.isValidObjectId(String(id)) || !await Membership.exists({ userId: id, companyId, active: true }))
                throw new HttpError(400, 'Reviewer must be an active company member');
        }
    }
    if (input.reviewerId && (!mongoose.isValidObjectId(String(input.reviewerId)) || !await Membership.exists({ userId: input.reviewerId, companyId, active: true })))
        throw new HttpError(400, 'Reviewer must be a company member');
    if (input.ownerId) {
        if (!mongoose.isValidObjectId(String(input.ownerId)))
            throw new HttpError(400, 'Invalid ownerId');
        if (!await Membership.exists({ userId: input.ownerId, companyId, active: true }))
            throw new HttpError(400, 'Owner must be an active company member');
        if (req.actor?.roles[companyId] === 'employee' && String(input.ownerId) !== req.actor.id)
            throw new HttpError(403, 'Employee cannot assign work to others');
    }
}
function cleanBody(entity: string, body: any, creating = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new HttpError(400, 'Expected record object');
    const cleaned = Object.fromEntries(Object.entries(body).filter(([key]) => !restrictedFields.has(key) && !(entity === 'leads' && key === 'projectId')));
    const schema = modelFor(entity).schema;
    for (const [key, value] of Object.entries(cleaned)) {
        if (!schema.path(key))
            throw new HttpError(400, `Unknown field ${key}`);
        if (typeof value === 'object' && value !== null && !Array.isArray(value))
            throw new HttpError(400, `Invalid nested value for ${key}`);
    }
    if (cleaned.title !== undefined && (typeof cleaned.title !== 'string' || !cleaned.title.trim()))
        throw new HttpError(400, 'Title is required');
    if (creating && !cleaned.title)
        throw new HttpError(400, 'Title is required');
    if (cleaned.status && statuses[entity] && !statuses[entity].includes(String(cleaned.status)))
        throw new HttpError(400, 'Invalid status');
    if (cleaned.isActive !== undefined && typeof cleaned.isActive !== 'boolean') throw new HttpError(400,'isActive must be boolean');
    for (const key of moneyFields) {
        if (cleaned[key] !== undefined) {
            if (key === 'amount' && positiveMoneyEntities.has(entity))
                positiveAmount(cleaned[key]);
            else
                nonNegativeAmount(cleaned[key]);
        }
    }
    if (entity === 'leads' && cleaned.stage !== undefined &&
        !['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'].includes(String(cleaned.stage))) {
        throw new HttpError(400, 'Invalid opportunity stage');
    }
    if (entity === 'projects' && cleaned.progress !== undefined &&
        (!Number.isFinite(Number(cleaned.progress)) || Number(cleaned.progress) < 0 || Number(cleaned.progress) > 100)) {
        throw new HttpError(400, 'Project progress must be between 0 and 100');
    }
    if (controlled.has(entity) && cleaned.status !== undefined)
        throw new HttpError(400, 'Controlled status is managed by the workflow');
    return cleaned;
}
router.get('/lookups/clients', wrap(async(req,res)=>{
    const ids=(req.companyIds || []).filter(id=>['sales','finance','projects','products'].some(domain=>can(req,id,domain,'read')));
    // Per-form x-company-id limits lookup results to the selected company.
    if(!ids.length)throw new HttpError(403,'Access to clients is required for this company');
    const rows=await Client.find({companyId:{$in:ids},status:{$ne:'archived'},isActive:{$ne:false}}).select('title email phone contactPerson companyId').limit(500).sort({title:1}).lean();
    res.json({items:rows});
}));
// A Finance user may reference a project from another company they are permitted to access.
// The selector exposes only names/IDs, never confidential project details.
router.get('/lookups/projects', wrap(async(req,res)=>{
    const ids = (req.companyIds || []).filter(id=>can(req,id,'projects','read') || can(req,id,'finance','read'));
    if (!ids.length) throw new HttpError(403,'Project lookup permission required');
    const rows = await Project.find({companyId:{$in:ids},status:{$ne:'archived'},isActive:{$ne:false}})
        .select('title clientId companyId status').sort({createdAt:-1}).limit(500).lean();
    const companies=await Company.find({_id:{$in:ids}}).select('name').lean();
    const names=new Map(companies.map(c=>[String(c._id),c.name]));
    res.json({items:rows.map(r=>({...r,companyName:names.get(String(r.companyId))||''}))});
}));

// A reconciliation-friendly view of open FIFO buy lots, plus realized profit/loss.
router.get('/usdt/inventory',wrap(async(req,res)=>{
    const ids=allowedCompanies(req,'advisory');
    if(!ids.length)throw new HttpError(403,'Advisory permission required');
    const rows=await UsdtTransaction.find({companyId:{$in:ids},status:'posted'}).sort({tradeDate:1,createdAt:1}).lean();
    const openLots=rows.filter(x=>x.side==='buy'&&D(x.remainingQuantity?.toString()||0).gt(0));
    let qty=D(0),value=D(0),realized=D(0),purchases=D(0),sales=D(0);
    for(const lot of openLots){const rem=D(lot.remainingQuantity?.toString()||0);qty=qty.plus(rem);value=value.plus(rem.times(D(lot.rateInr?.toString()||0)));}
    for(const x of rows){if(x.side==='sell'){sales=sales.plus(D(x.totalInr?.toString()||0));realized=realized.plus(D(x.realizedPnl?.toString()||0));}else purchases=purchases.plus(D(x.totalInr?.toString()||0));}
    res.json({availableQuantity:qty.toFixed(8),costBasisInr:value.toFixed(2),averageBuyRate:qty.gt(0)?value.div(qty).toFixed(4):'0',realizedPnlInr:realized.toFixed(2),totalBoughtInr:purchases.toFixed(2),totalSoldInr:sales.toFixed(2),lots:openLots.map(x=>({id:String(x._id),companyId:String(x.companyId),title:x.title,purchasedQuantity:x.quantity?.toString(),remainingQuantity:x.remainingQuantity?.toString(),buyRateInr:x.rateInr?.toString(),tradeDate:x.tradeDate,reference:x.reference}))});
}));

router.get('/lookups/bank-accounts', wrap(async(req,res)=>{
    const ids=(req.companyIds || []).filter(id=>can(req,id,'finance','read'));
    if(!ids.length)throw new HttpError(403,'Finance permission required');
    const rows=await BankAccount.find({companyId:{$in:ids},isActive:{$ne:false},status:{$ne:'archived'}}).select('title bankName accountName currency companyId').limit(500).sort({title:1}).lean();
    res.json({items:rows});
}));
router.get('/batches/occupancy', wrap(async (req, res) => {
    const ids = allowedCompanies(req, 'learning');
    const batches = await Batch.find({ companyId: { $in: ids }, status: { $ne: 'archived' } }).lean();
    const students = await Student.find({ companyId: { $in: ids }, status: { $ne: 'archived' }, batchId: { $in: batches.map(b => b._id) } }).select('title batchId').lean();
    res.json(batches.map(b => ({ ...b, studentNames: students.filter(x => String(x.batchId) === String(b._id)).map(x => x.title), enrolled: students.filter(x => String(x.batchId) === String(b._id)).length, remainingSeats: Math.max(0, Number(b.seats || 0) - students.filter(x => String(x.batchId) === String(b._id)).length) })));
}));
router.get('/:entity', wrap(async (req, res) => {
    const entity = req.params.entity;
    const domain = moduleOf[entity];
    const M = modelFor(entity);
    if (!domain)
        throw new HttpError(404, 'Unknown domain');
    const q: any = { $and: [scopedQuery(req, domain)] };
    if (req.query.status)
        q.$and.push({ status: String(req.query.status) });
    else q.$and.push({ status: { $ne: 'archived' } });
    if (req.query.search)
        q.$and.push({ title: { $regex: String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
    if (req.query.projectId && mongoose.isValidObjectId(String(req.query.projectId)))
        q.$and.push({ projectId: String(req.query.projectId) });
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 10000);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const [items, total] = await Promise.all([M.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), M.countDocuments(q)]);
    res.json({ items, total, page, limit });
}));
router.post('/:entity', wrap(async (req, res) => {
    const entity = req.params.entity, domain = moduleOf[entity];
    const M = modelFor(entity);
    const companyId = requireCompany(req);
    requirePermission(req, domain);
    if (['approvals', 'receipts', 'installments', 'dailyPerformance'].includes(entity))
        throw new HttpError(400, 'Use the dedicated workflow for this record type');
    const input = cleanBody(entity, req.body, true);
    if (entity === 'invoices' && input.status && !['draft', 'sent'].includes(input.status)) {
        throw new HttpError(400, 'New invoices must start as draft or sent');
    }
    if (positiveMoneyEntities.has(entity) && input.amount === undefined)
        throw new HttpError(400, 'Amount is required');
    await validateRelations(input, companyId, req, entity);
    if (entity === 'events' && input.status && !['active','cancelled','postponed'].includes(input.status)) throw new HttpError(400,'Invalid event status');
    if (entity === 'events' && input.meetingUrl && (!/^https:\/\//i.test(String(input.meetingUrl)) || String(input.meetingUrl).length > 1000)) throw new HttpError(400, 'Meeting link must use HTTPS');
    if (entity === 'events' && (!input.startAt || !input.endAt || new Date(String(input.endAt)) <= new Date(String(input.startAt))))
        throw new HttpError(400, 'Event end must be after start');
    if (entity === 'transfers') {
        const targetCompanyId = String(input.targetCompanyId || '');
        if (!targetCompanyId || !can(req, targetCompanyId, 'finance', 'write') || targetCompanyId === companyId)
            throw new HttpError(403, 'Target must be a distinct authorized company');
    }
    if (entity === 'students' && input.batchId) {
        const batch = await Batch.findOne({ _id: input.batchId, companyId });
        const filled = await Student.countDocuments({ companyId, batchId: input.batchId, status: { $ne: 'archived' } });
        if (!batch || filled >= Number(batch.seats || 0)) throw new HttpError(409, 'Batch is full');
    }
    if (entity === 'students')
        input.outstanding = input.totalFees || '0';
    if (entity === 'capitalMovements' && input.direction === 'transfer') {
        if (!input.destinationTradingAccountId || String(input.destinationTradingAccountId) === String(input.tradingAccountId))
            throw new HttpError(400, 'Transfer requires a distinct destination trading account');
    }
    if (entity === 'usdtTransactions') {
        const qty = D(input.quantity || 0), rate = D(input.rateInr || 0);
        if (!qty.isFinite() || !rate.isFinite() || qty.lte(0) || rate.lte(0))
            throw new HttpError(400, 'Positive USDT quantity and INR rate required');
        if(qty.decimalPlaces()>8 || rate.decimalPlaces()>4)
            throw new HttpError(400,'USDT supports up to 8 quantity decimals and 4 price decimals');
        if (!['buy','sell'].includes(String(input.side))) throw new HttpError(400, 'Choose buy or sell');
        if (input.side === 'buy' && input.sellRateInr !== undefined) {
            const sellRate = D(input.sellRateInr);
            if (!sellRate.isFinite() || sellRate.lte(0) || sellRate.decimalPlaces()>4) throw new HttpError(400,'Sell price must be positive, with up to 4 decimals');
        }
        if (input.side === 'sell' && input.sellRateInr !== undefined) throw new HttpError(400,'Sell rate is entered in INR per USDT');
        input.totalInr = qty.times(rate).toFixed(2);
    }
    if (entity==='invoices' && input.projectId && input.clientId) {
        const project = await Project.findById(input.projectId).select('clientId companyId').lean();
        if(project?.clientId && String(project.clientId)!==String(input.clientId))
            throw new HttpError(400,'Selected project belongs to a different client; choose the matching client');
    }
    if (entity === 'leads' && input.clientId) {
        const client = await Client.findOne({ _id: input.clientId, companyId }).lean();
        if (client) { input.contact ||= client.contactPerson; input.contactEmail ||= client.email; }
    }
    if (entity === 'proposals' && input.leadId) {
        const lead = await Lead.findOne({ _id: input.leadId, companyId }).lean();
        if (lead) { input.amount ||= lead.amount; input.ownerId ||= lead.ownerId; }
    }
    if (entity === 'products') {
        if (!input.sku) {
            const code = String(input.title).replace(/[^a-z0-9]/gi, '').slice(0,6).toUpperCase() || 'PROD';
            input.sku = `${code}-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`;
        }
    }
    if (entity === 'tradingAccounts' && !input.title) input.title = `${input.accountKind || 'live'} trading account`;
    if (entity === 'subscriptions') {
        input.startAt ||= new Date();
        if (!input.renewAt && input.durationMonths) input.renewAt = addCalendarMonths(input.startAt, Number(input.durationMonths));
    }
    if (entity === 'tasks' && input.assigneeIds?.length && !input.ownerId) input.ownerId = input.assigneeIds[0];
    if (entity === 'tasks' && !input.status)
        input.status = 'backlog';
    if (entity === 'invoices' && !input.status)
        input.status = 'draft';
    if (['expenses', 'transfers', 'capitalMovements'].includes(entity))
        input.status = 'pending';
    const needsApproval = ['expenses', 'transfers', 'capitalMovements'].includes(entity) || (entity==='invoices' && input.status==='sent' && input.reviewerIds?.length>0);
    let doc: any;
    if (needsApproval) {
        // The record and approval must either both exist, or both roll back.
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                [doc] = await M.create([{ ...input, companyId, createdBy: req.actor!.id }], { session });
                const [request] = await ApprovalRequest.create([{
                        title: `Approve: ${doc.title}`,
                        companyId,
                        createdBy: req.actor!.id,
                        requestedBy: req.actor!.id,
                        recordType: entity,
                        recordId: doc._id,
                        amount: doc.amount || '0',
                        currency: doc.currency || 'INR',
                        reviewerIds: input.reviewerIds || [],
                        status: 'pending',
                    }], { session });
                await M.updateOne({ _id: doc._id, companyId }, { $set: { approvalId: request._id } }, { session });
            });
        }
        finally {
            await session.endSession();
        }
    }
    else if (entity === 'usdtTransactions') {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const qty = D(input.quantity), rate = D(input.rateInr);
                if (input.side === 'sell') {
                    // FIFO across open buy lots, company-isolated, atomic with the sell record.
                    const buys = await UsdtTransaction.find({ companyId, side: 'buy', remainingQuantity: { $gt: mongoose.Types.Decimal128.fromString('0') } }).sort({ tradeDate: 1, createdAt: 1 }).session(session);
                    let remaining = qty;
                    let pnl = D(0);
                    const allocations: Array<{ buyTradeId:any; quantity:string; purchaseRate:string }> = [];
                    for (const buy of buys) {
                        if (remaining.lte(0)) break;
                        const available = D(buy.remainingQuantity?.toString());
                        if (available.lte(0)) continue;
                        const used = remaining.lt(available) ? remaining : available;
                        const nextBalance = available.minus(used);
                        const result = await UsdtTransaction.updateOne({ _id: buy._id, companyId, remainingQuantity: buy.remainingQuantity }, { $set: { remainingQuantity: nextBalance.toFixed(8) } }, { session });
                        if (!result.modifiedCount) throw new HttpError(409, 'USDT inventory changed; retry');
                        pnl = pnl.plus(used.times(rate.minus(D(buy.rateInr?.toString()))));
                        allocations.push({ buyTradeId:buy._id, quantity:used.toFixed(8), purchaseRate:buy.rateInr.toString() });
                        remaining = remaining.minus(used);
                    }
                    if (remaining.gt(0)) throw new HttpError(409, 'Insufficient purchased USDT inventory');
                    input.allocations = allocations;
                    input.realizedPnl = pnl.toFixed(2);
                    input.remainingQuantity = '0';
                } else {
                    input.remainingQuantity = input.sellRateInr === undefined ? qty.toFixed(8) : '0';
                    input.realizedPnl = '0';
                }
                [doc] = await models.usdtTransactions.create([{ ...input, status: 'posted', companyId, createdBy: req.actor!.id }], { session });
                if(input.side==='buy' && input.sellRateInr!==undefined){
                    // Same-form buy → sell: close all units in one atomic transaction.
                    // The paired records preserve both the purchase and sale audit trail.
                    const sellRate=D(input.sellRateInr);
                    const totals=calculateUsdtSale(qty.toString(),rate.toString(),sellRate.toString());
                    const [sale] = await UsdtTransaction.create([{
                        title:'USDT Sell', side:'sell', quantity:qty.toFixed(8),
                        rateInr:sellRate.toFixed(4), totalInr:totals.proceeds,
                        realizedPnl:totals.realizedPnl, remainingQuantity:'0',
                        allocations:[{buyTradeId:doc._id,quantity:qty.toFixed(8),purchaseRate:rate.toString()}],
                        relatedTradeId:doc._id, tradeDate:input.tradeDate||new Date(),
                        reference:input.reference||'', status:'posted',companyId,createdBy:req.actor!.id
                    }],{session});
                    doc.relatedTradeId=sale._id;
                    await doc.save({session});
                }
            });
        } finally { await session.endSession(); }
    } else if (entity === 'students') {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                [doc] = await Student.create([{ ...input, companyId, createdBy: req.actor!.id }], { session });
                if (Number(input.totalFees || 0) > 0) {
                    await Installment.create([{ companyId, createdBy: req.actor!.id, studentId: doc._id, title: `Course fee: ${doc.title}`, amount: input.totalFees, paidAmount: '0', dueAt: new Date(), status: 'pending' }], { session });
                }
            });
        } finally { await session.endSession(); }
    } else {
        doc = await M.create({ ...input, companyId, createdBy: req.actor!.id });
    }
    await audit(req, 'create', entity, String(doc._id), { title: doc.title }, companyId);
    if(entity==='usdtTransactions' && input.side==='buy' && input.sellRateInr!==undefined) {
        const pairedSale=await UsdtTransaction.findById(doc.relatedTradeId).lean();
        res.status(201).json({...doc.toObject(),pairedSale});
    } else res.status(201).json(doc);
}));
// Voiding posted trades is allowed only when FIFO inventory can be reversed safely.
// Physical deletion is intentionally prohibited for financial auditability.
router.post('/usdt/:id/void',wrap(async(req,res)=>{
    const companyId=requireCompany(req);
    requirePermission(req,'advisory');
    const id=checkId(req.params.id);
    const session=await mongoose.startSession();
    try{
        await session.withTransaction(async()=>{
            const trade=await UsdtTransaction.findOne({_id:id,companyId}).session(session);
            if(!trade)throw new HttpError(404,'USDT transaction not found');
            if(trade.status!=='posted')throw new HttpError(409,'Only posted trades can be voided');
            if(trade.side==='buy'){
                const used=await UsdtTransaction.exists({companyId,side:'sell',status:'posted','allocations.buyTradeId':trade._id}).session(session);
                if(used)throw new HttpError(409,'Void the linked sale(s) before voiding this buy');
                trade.remainingQuantity=mongoose.Types.Decimal128.fromString('0');
            } else {
                for(const allocation of trade.allocations||[]){
                    const buy=await UsdtTransaction.findOne({_id:allocation.buyTradeId,companyId,status:'posted'}).session(session);
                    if(!buy)throw new HttpError(409,'Original buy lot missing; cannot reverse allocation');
                    const updated=D(buy.remainingQuantity?.toString()||0).plus(D(allocation.quantity?.toString()||0));
                    if(updated.gt(D(buy.quantity?.toString()||0)))throw new HttpError(409,'Inventory mismatch; review trade before void');
                    buy.remainingQuantity=mongoose.Types.Decimal128.fromString(updated.toFixed(8));
                    await buy.save({session});
                }
            }
            trade.status='voided';trade.isActive=false;
            await trade.save({session});
            await AuditLog.create([{companyId,userId:req.actor!.id,action:'usdt.void',entity:'usdtTransactions',entityId:trade._id,details:{reason:'Operator void; original trade preserved'},ip:req.ip}],{session});
        });
    } finally {await session.endSession();}
    res.json({message:'Trade voided. Inventory and realized P&L were recalculated from active records.'});
}));

router.get('/:entity/:id', wrap(async (req, res) => {
    const entity = req.params.entity, M = modelFor(entity);
    const doc = await M.findOne({ _id: checkId(req.params.id), $and: [scopedQuery(req, moduleOf[entity])] }).lean();
    if (!doc)
        throw new HttpError(404, 'Record not found');
    res.json(doc);
}));
router.patch('/:entity/:id', wrap(async (req, res) => {
    const entity = req.params.entity, domain = moduleOf[entity], M = modelFor(entity);
    const companyId = requireCompany(req);
    requirePermission(req, domain);
    checkId(req.params.id);
    if (['approvals', 'receipts', 'installments', 'dailyPerformance'].includes(entity))
        throw new HttpError(403, 'Use the dedicated workflow');
    const before = await M.findOne({ _id: req.params.id, companyId });
    if (!before)
        throw new HttpError(404, 'Record not found');
    if (req.actor?.roles[companyId] === 'employee' && String(before.ownerId) !== req.actor.id && String(before.createdBy) !== req.actor.id)
        throw new HttpError(403, 'Employees may edit only their own records');
    if (['posted', 'paid', 'partial'].includes(before.status) && ['expenses', 'transfers', 'invoices'].includes(entity)) {
        throw new HttpError(409, 'Posted financial records cannot be edited; use an authorized reversal or adjustment');
    }
    if (['approved', 'rejected'].includes(before.status) && ['expenses', 'transfers', 'capitalMovements'].includes(entity)) {
        throw new HttpError(409, 'Decided financial requests are immutable');
    }
    const changes = cleanBody(entity, req.body);
    await validateRelations(changes, companyId, req, entity);
    if (entity === 'students' && changes.batchId && String(changes.batchId) !== String(before.batchId || '')) {
        const batch = await Batch.findOne({ _id: changes.batchId, companyId });
        const filled = await Student.countDocuments({ companyId, batchId: changes.batchId, status: { $ne: 'archived' } });
        if (!batch || filled >= Number(batch.seats || 0)) throw new HttpError(409, 'Batch is full');
    }
    if (entity === 'leads' && before.projectId && changes.stage && changes.stage !== before.stage) {
        throw new HttpError(409, 'Converted deals cannot change stage without a change-management workflow');
    }
    if (entity === 'invoices' && before.status === 'sent' &&
        ['amount', 'currency', 'number', 'clientId', 'projectId'].some(field => changes[field] !== undefined)) {
        throw new HttpError(409, 'Issued invoice financial details are locked');
    }
    if (entity === 'events' && changes.status && !['active','cancelled','postponed'].includes(changes.status)) throw new HttpError(400,'Invalid event status');
    if (entity === 'events' && changes.meetingUrl && !/^https:\/\//i.test(String(changes.meetingUrl))) throw new HttpError(400, 'Meeting link must use HTTPS');
    if (entity === 'students' && changes.totalFees !== undefined && String(changes.totalFees) !== String(before.totalFees)) throw new HttpError(409,'Use a fee adjustment workflow to change enrolled fees');
    if (entity === 'events') {
        const start = changes.startAt ?? before.startAt;
        const end = changes.endAt ?? before.endAt;
        if (!start || !end || new Date(String(end)) <= new Date(String(start))) {
            throw new HttpError(400, 'Event end must be after start');
        }
    }
    if (entity === 'invoices' && changes.status === 'sent' && (changes.reviewerIds?.length || before.reviewerIds?.length)) throw new HttpError(409,'Use Request invoice review to notify assigned reviewers');
    if (entity === 'invoices' && changes.status && !['draft', 'sent'].includes(changes.status))
        throw new HttpError(409, 'Use posting and receipt workflows for financial status');
    if (entity === 'usdtTransactions') throw new HttpError(409, 'Executed USDT trades cannot be changed');
    if (entity === 'tasks' && changes.status === 'completed')
        changes.completedAt = new Date();
    if (['expenses', 'transfers', 'capitalMovements'].includes(entity) && before.status !== 'draft') {
        if (changes.amount !== undefined || changes.currency !== undefined || changes.targetCompanyId !== undefined)
            throw new HttpError(409, 'A submitted request cannot change financial details');
    }
    if (changes.ownerId && req.actor?.roles[companyId] === 'employee' && String(changes.ownerId) !== req.actor.id)
        throw new HttpError(403, 'Cannot reassign tasks');
    const updated = await M.findOneAndUpdate({ _id: before._id, companyId }, { $set: changes }, { new: true, runValidators: true });
    await audit(req, 'update', entity, req.params.id, { fields: Object.keys(changes) }, companyId);
    res.json(updated);
}));
router.patch('/:entity/:id/state', wrap(async (req,res) => {
    const { entity, id } = req.params; const companyId = requireCompany(req);
    requirePermission(req, moduleOf[entity]); checkId(id);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (['approvals','receipts','installments','dailyPerformance','capitalMovements','usdtTransactions','invoices','expenses','transfers'].includes(entity)) throw new HttpError(409,'Financial history cannot be deactivated; use financial workflows');
    const M = modelFor(entity); const row = await M.findOneAndUpdate({ _id:id, companyId, status: { $ne:'archived' } }, { $set:{isActive} }, {new:true});
    if (!row) throw new HttpError(404,'Record unavailable');
    await audit(req, isActive?'activate':'deactivate',entity,id,{},companyId);res.json(row);
}));
router.delete('/:entity/:id', wrap(async (req, res) => {
    const entity = req.params.entity, domain = moduleOf[entity], M = modelFor(entity);
    const companyId = requireCompany(req);
    requirePermission(req, domain);
    checkId(req.params.id);
    if (['approvals', 'receipts', 'installments', 'dailyPerformance', 'expenses', 'invoices', 'transfers', 'capitalMovements', 'usdtTransactions'].includes(entity))
        throw new HttpError(403, 'Financial and audit-related records cannot be deleted');
    const ownershipFilter = req.actor?.roles[companyId] === 'employee' ? { $or: [{ ownerId: req.actor.id }, { createdBy: req.actor.id }] } : {};
    const doc = await M.findOneAndUpdate({ _id: req.params.id, companyId, ...ownershipFilter }, { status: 'archived', archivedAt: new Date(), isActive: false }, { new: true });
    if (!doc)
        throw new HttpError(404, 'Record not found');
    await audit(req, 'archive', entity, req.params.id, {}, companyId);
    res.json({ archived: true });
}));
export default router;
