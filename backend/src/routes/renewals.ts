import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Renewal, RenewalPayment, Expense, ApprovalRequest, Membership, User, Vendor, StoredFile, JournalEntry, AuditLog } from '../models.js';
import { audit, HttpError, allowedCompanies, can, requireCompany, requirePermission, wrap } from '../lib/security.js';
import { positiveAmount, makeJournal } from '../lib/finance.js';
import { DEFAULT_REMINDER_DAYS, renewalNextDue, renewalState, recurrenceAnchor, utcDate } from '../lib/renewals.js';
const router=Router();
const objectId=z.string().regex(/^[0-9a-fA-F]{24}$/,'Invalid ID');
const currency=z.enum(['INR','AED','SAR','USD']);
const frequency=z.enum(['monthly','quarterly','half-yearly','yearly','custom']);
const days=z.array(z.number().int().min(0).max(365)).max(10).refine(a=>new Set(a).size===a.length,'Duplicate reminder days');
const fields=z.object({
    title:z.string().trim().min(2).max(160),description:z.string().trim().max(1500).optional(),
    category:z.enum(['Hosting','Domain','SaaS','License','Insurance','Rent','AMC','Other']),
    vendorId:objectId.nullable().optional(),vendorName:z.string().trim().max(140).optional(),
    amount:z.union([z.string(),z.number()]),currency,
    nextDueAt:z.string(),frequency,customMonths:z.number().int().min(1).max(120).optional(),
    reminderDays:days.default([...DEFAULT_REMINDER_DAYS]),assigneeId:objectId.nullable().optional(),
}).strict();
const update=fields.partial().omit({reminderDays:true}).extend({reminderDays:days.optional()}).strict();
function scopedCompany(req:import('express').Request,action:'read'|'write'='read'){
    const id=requireCompany(req);
    if(!can(req,id,'finance',action)) throw new HttpError(403,'Finance permission required');
    return id;
}
function id(value:string){return objectId.parse(value);}
async function verifyRelations(companyId:string,input:{vendorId?:string|null;assigneeId?:string|null}){
    if(input.vendorId&&!await Vendor.exists({_id:input.vendorId,companyId,isActive:{$ne:false}}))
        throw new HttpError(400,'Vendor is not in this company');
    if(input.assigneeId&&!await Membership.exists({companyId,userId:input.assigneeId,active:true,removedAt:{$exists:false}}))
        throw new HttpError(400,'Assigned user must be an active company member');
}
function prepare(input:any){
    const nextDueAt=utcDate(input.nextDueAt);
    const amount=positiveAmount(input.amount).toFixed(2);
    renewalNextDue(nextDueAt,input.frequency,input.customMonths);
    return {...input,amount,nextDueAt,vendorId:input.vendorId||undefined,assigneeId:input.assigneeId||undefined,
        customMonths:input.frequency==='custom'?input.customMonths:undefined};
}
function serialize(row:any){
    const status=row.status==='active'?renewalState(row.nextDueAt,new Date(),row.reminderDays):null;
    return {...row,daysUntil:status?.daysUntil??null,alert:status?.alert??row.status};
}
router.get('/',wrap(async(req,res)=>{
    const ids=allowedCompanies(req,'finance');
    if(!ids.length)throw new HttpError(403,'Finance read permission required');
    const company=String(req.query.companyId||'');
    if(company && !ids.includes(company))throw new HttpError(403,'Company not authorized');
    const target=company?[company]:ids;
    const filter:any={companyId:{$in:target}};
    if(req.query.status && ['active','paused','cancelled'].includes(String(req.query.status)))filter.status=req.query.status;
    const rows=await Renewal.find(filter).sort({nextDueAt:1,_id:1}).limit(500).lean();
    const linkedIds=rows.filter(r=>r.currentExpenseId).map(r=>r.currentExpenseId);
    const linked=linkedIds.length?await Expense.find({_id:{$in:linkedIds},companyId:{$in:target}}).select('_id status').lean():[];
    const states=new Map(linked.map(x=>[String(x._id),x.status]));
    const items=rows.map(r=>({...serialize(r),linkedExpenseStatus:r.currentExpenseId?states.get(String(r.currentExpenseId))||'missing':null}));
    const active=items.filter(x=>x.status==='active');
    const summary={active:active.length,due7:active.filter(x=>x.daysUntil!==null&&x.daysUntil>=0&&x.daysUntil<=7).length,
        due30:active.filter(x=>x.daysUntil!==null&&x.daysUntil>=0&&x.daysUntil<=30).length,
        overdue:active.filter(x=>x.alert==='overdue').length,
        alerts:active.filter(x=>x.alert==='due-soon'||x.alert==='overdue').length};
    res.setHeader('Cache-Control','private, no-store');
    res.json({items,summary,total:items.length,truncated:items.length===500});
}));
router.get('/:id/history',wrap(async(req,res)=>{
    const ids=allowedCompanies(req,'finance');
    if(!ids.length)throw new HttpError(403,'Finance read permission required');
    const renewal=await Renewal.findOne({_id:id(req.params.id),companyId:{$in:ids}}).lean();
    if(!renewal)throw new HttpError(404,'Renewal not found');
    const items=await RenewalPayment.find({renewalId:renewal._id,companyId:renewal.companyId}).sort({createdAt:-1}).limit(120).lean();
    res.json({items});
}));
router.post('/',wrap(async(req,res)=>{
    const companyId=scopedCompany(req,'write');
    const input=fields.parse(req.body);
    await verifyRelations(companyId,input);
    const values=prepare(input);
    const anchor=recurrenceAnchor(values.nextDueAt);
    const doc=await Renewal.create({...values,anchorDay:anchor.day,monthEndAnchor:anchor.monthEnd,companyId,createdBy:req.actor!.id,status:'active'});
    await audit(req,'renewal.create','renewals',String(doc._id),{title:doc.title,nextDueAt:doc.nextDueAt,amount:doc.amount.toString()},companyId);
    res.status(201).json(serialize(doc.toObject()));
}));
router.patch('/:id',wrap(async(req,res)=>{
    const companyId=scopedCompany(req,'write');
    const changes=update.parse(req.body);
    if(!Object.keys(changes).length)throw new HttpError(400,'No changes');
    const doc=await Renewal.findOne({_id:id(req.params.id),companyId});
    if(!doc)throw new HttpError(404,'Renewal not found');
    if(doc.status==='cancelled')throw new HttpError(409,'Cancelled renewals are historical records');
    if(doc.currentExpenseId && ['amount','currency','nextDueAt','frequency','customMonths','vendorId'].some(x=>x in changes)) {
        const linked=await Expense.findOne({_id:doc.currentExpenseId,companyId}).select('status').lean();
        if(linked?.status!=='rejected')throw new HttpError(409,'Resolve the linked expense before editing financial terms');
    }
    const merged={...doc.toObject(),...changes,nextDueAt:changes.nextDueAt??doc.nextDueAt.toISOString().slice(0,10),
        amount:changes.amount??doc.amount.toString()};
    await verifyRelations(companyId,changes);
    const values=prepare(merged);
    const anchor=changes.nextDueAt?recurrenceAnchor(values.nextDueAt):{day:doc.anchorDay||doc.nextDueAt.getUTCDate(),monthEnd:!!doc.monthEndAnchor};
    doc.set({...values,anchorDay:anchor.day,monthEndAnchor:anchor.monthEnd,updatedBy:req.actor!.id});
    await doc.save();
    await audit(req,'renewal.update','renewals',String(doc._id),{fields:Object.keys(changes),changes},companyId);
    res.json(serialize(doc.toObject()));
}));
router.post('/:id/status',wrap(async(req,res)=>{
    const companyId=scopedCompany(req,'write');
    const {status}=z.object({status:z.enum(['active','paused','cancelled'])}).strict().parse(req.body);
    const doc=await Renewal.findOne({_id:id(req.params.id),companyId});
    if(!doc)throw new HttpError(404,'Renewal not found');
    if(doc.status==='cancelled')throw new HttpError(409,'Cancelled renewals cannot be reactivated');
    if(status==='cancelled' && doc.currentExpenseId) {
        const linked=await Expense.findOne({_id:doc.currentExpenseId,companyId}).select('status').lean();
        if(linked?.status!=='rejected')throw new HttpError(409,'Resolve linked expense before cancelling');
    }
    if(doc.status===status)return res.json(serialize(doc.toObject()));
    doc.status=status;doc.updatedBy=new mongoose.Types.ObjectId(req.actor!.id);
    await doc.save();
    await audit(req,'renewal.status','renewals',String(doc._id),{status},companyId);
    res.json(serialize(doc.toObject()));
}));
// This uses the EXISTING maker/checker and Finance posting workflow.
// A renewal cannot bypass accounting merely by pressing "mark paid".
router.post('/:id/request-expense',wrap(async(req,res)=>{
    const companyId=scopedCompany(req,'write');
    const input=z.object({reviewerIds:z.array(objectId).min(1).max(12)}).strict().parse(req.body);
    const ids=[...new Set(input.reviewerIds)];
    if(ids.includes(req.actor!.id))throw new HttpError(400,'Requester cannot approve their own expense');
    const members=await Membership.find({companyId,userId:{$in:ids},active:true,removedAt:{$exists:false}}).lean();
    const activeUsers=await User.countDocuments({_id:{$in:ids},active:true});
    if(activeUsers!==ids.length||members.length!==ids.length||members.some(m=>!(m.role==='owner'||m.role==='super_admin'||(m.permissions||[]).includes('approvals:write'))))
        throw new HttpError(400,'Approvers must have active company approval permissions');
    const session=await mongoose.startSession();let expense:any;
    try{await session.withTransaction(async()=>{
        const renewal=await Renewal.findOne({_id:id(req.params.id),companyId,status:'active'}).session(session);
        if(!renewal)throw new HttpError(404,'Active renewal not found');
        const priorExpenseId=renewal.currentExpenseId;
        if(priorExpenseId){
            const prior=await Expense.findOne({_id:priorExpenseId,companyId}).session(session);
            if(prior?.status!=='rejected')throw new HttpError(409,'Existing linked expense must be rejected before retrying');
        }
        [expense]=await Expense.create([{title:`Subscription expense: ${renewal.title}`,description:`Renewal: ${renewal.title} · Due ${renewal.nextDueAt.toISOString().slice(0,10)}`,
            companyId,createdBy:req.actor!.id,vendorId:renewal.vendorId, vendor:renewal.vendorName,
            category:['Hosting','Domain','SaaS','License'].includes(renewal.category)?'Technology':'Operations',amount:renewal.amount.toString(),currency:renewal.currency,reviewerIds:ids,status:'pending'}],{session});
        const [approval]=await ApprovalRequest.create([{title:`Approve: ${renewal.title}`,companyId,createdBy:req.actor!.id,requestedBy:req.actor!.id,
            recordType:'expenses',recordId:expense._id,amount:renewal.amount.toString(),currency:renewal.currency,reviewerIds:ids,status:'pending'}],{session});
        await Expense.updateOne({_id:expense._id,companyId},{$set:{approvalId:approval._id}},{session});
        const changed=await Renewal.updateOne({_id:renewal._id,companyId,...(priorExpenseId?{currentExpenseId:priorExpenseId}:{currentExpenseId:{$exists:false}})},{$set:{currentExpenseId:expense._id}},{session});
        if(!changed.modifiedCount)throw new HttpError(409,'Another expense was linked; reload renewal');
        await AuditLog.create([{companyId,userId:req.actor!.id,action:'renewal.expense-requested',entity:'renewals',entityId:renewal._id,
            details:{expenseId:String(expense._id),replacesRejectedExpenseId:priorExpenseId?String(priorExpenseId):null,approvalId:String(approval._id),dueAt:renewal.nextDueAt},ip:req.ip}],{session});
    });}finally{await session.endSession();}
    res.status(201).json({expenseId:expense._id,message:'Expense approval requested. Approve and post the expense before settlement.'});
}));
router.post('/:id/complete',wrap(async(req,res)=>{
    const companyId=scopedCompany(req,'write');
    const {reference,proofFileId}=z.object({reference:z.string().trim().min(2).max(140),proofFileId:objectId.optional()}).strict().parse(req.body);
    if(proofFileId&&!await StoredFile.exists({_id:proofFileId,companyId,purpose:'renewal-proof'}))throw new HttpError(400,'Payment proof is not in this company');
    const session=await mongoose.startSession();let completed:any;
    try{await session.withTransaction(async()=>{
        const renewal=await Renewal.findOne({_id:id(req.params.id),companyId,status:'active'}).session(session);
        if(!renewal)throw new HttpError(404,'Active renewal not found');
        if(!renewal.currentExpenseId)throw new HttpError(409,'Request and post a linked expense first');
        const expense=await Expense.findOne({_id:renewal.currentExpenseId,companyId,status:'posted'}).session(session);
        if(!expense)throw new HttpError(409,'Expense must be approved and posted before settlement');
        if(positiveAmount(expense.amount.toString()).toFixed(2)!==positiveAmount(renewal.amount.toString()).toFixed(2)||expense.currency!==renewal.currency)
            throw new HttpError(409,'Expense amount/currency differs from renewal');
        const amount=positiveAmount(expense.amount.toString()).toFixed(2);
        const nextDueAt=renewalNextDue(renewal.nextDueAt,renewal.frequency,renewal.customMonths,
            {day:renewal.anchorDay||renewal.nextDueAt.getUTCDate(),monthEnd:!!renewal.monthEndAnchor});
        const [payment]=await RenewalPayment.create([{companyId,renewalId:renewal._id,dueAt:renewal.nextDueAt,
            amount,currency:renewal.currency,expenseId:expense._id,reference,proofFileId,nextDueAt,recordedBy:req.actor!.id}],{session});
        // The approved expense already debits Expense / credits AP. Settle AP / Bank here.
        const [journal]=await JournalEntry.create([{companyId,referenceType:'renewalPayments',referenceId:payment._id,
            journalNumber:`RN-PAY-${expense._id}`,currency:renewal.currency,postedBy:req.actor!.id,
            lines:makeJournal(amount,'Accounts Payable','Bank')}],{session});
        const ex=await Expense.updateOne({_id:expense._id,companyId,status:'posted'},{$set:{status:'paid',paidAt:new Date()}},{session});
        if(!ex.modifiedCount)throw new HttpError(409,'Expense was already settled');
        const updated=await Renewal.updateOne({_id:renewal._id,companyId,currentExpenseId:expense._id,nextDueAt:renewal.nextDueAt},
            {$set:{nextDueAt,lastRenewedAt:new Date(),updatedBy:req.actor!.id},$unset:{currentExpenseId:''}},{session});
        if(!updated.modifiedCount)throw new HttpError(409,'Renewal already completed; reload');
        await RenewalPayment.updateOne({_id:payment._id,companyId},{$set:{settlementJournalId:journal._id}},{session});
        await AuditLog.create([{companyId,userId:req.actor!.id,action:'renewal.paid',entity:'renewals',entityId:renewal._id,
            details:{expenseId:String(expense._id),journalId:String(journal._id),paymentId:String(payment._id),reference,dueAt:renewal.nextDueAt,nextDueAt,proofFileId},ip:req.ip}],{session});
        completed={paymentId:payment._id,nextDueAt,expenseId:expense._id,journalId:journal._id};
    });}finally{await session.endSession();}
    res.json(completed);
}));
export default router;
