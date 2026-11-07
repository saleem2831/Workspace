import mongoose from 'mongoose';
import { Router } from 'express';
import { allowedCompanies, wrap } from '../lib/security.js';
import { Student, Course, Batch, Installment, Internship, TradingAccount, DailyPerformance, CapitalMovement, UsdtTransaction, Lead, Client, Proposal, Product, Subscription, Project, Milestone, Invoice, Expense, Transfer, ApprovalRequest } from '../models.js';
const router = Router();
router.get('/summary', wrap(async(req,res) => {
  const scope = (domain:string) => ({ companyId: { $in: allowedCompanies(req,domain) }, status: { $ne:'archived' } });
  const ready = (domain:string) => allowedCompanies(req,domain).length > 0;
  const count = (model:any, domain:string, extra:any={}) => ready(domain) ? model.countDocuments({ ...scope(domain), ...extra }) : Promise.resolve(0);
  const [students,courses,installments,internships,accounts,performances,movements,usdt,leads,clients,proposals,products,subscriptions,renewals,projects,milestones,atRisk,invoices,expenses,transfers,approvals] = await Promise.all([
    count(Student,'learning'),count(Course,'learning'),count(Installment,'learning',{status:{$in:['pending','partial']}}),count(Internship,'learning'),
    count(TradingAccount,'advisory'),count(DailyPerformance,'advisory'),count(CapitalMovement,'advisory',{status:'pending'}),count(UsdtTransaction,'advisory'),
    count(Lead,'sales'),count(Client,'sales'),count(Proposal,'sales'),count(Product,'products'),count(Subscription,'products',{status:'active'}),
    count(Subscription,'products',{renewAt:{$lte:new Date(Date.now()+30*86400000)},status:'active'}),
    count(Project,'projects'),count(Milestone,'projects'),count(Project,'projects',{risk:'at-risk'}),count(Invoice,'finance',{status:{$in:['sent','posted','partial']}}),count(Expense,'finance',{status:'pending'}),count(Transfer,'finance',{status:'pending'}),count(ApprovalRequest,'approvals',{status:'pending'})
  ]);
  const capitalByCurrency = ready('advisory') ? await TradingAccount.aggregate([{ $match: { companyId: { $in: allowedCompanies(req,'advisory').map(id => new mongoose.Types.ObjectId(id)) }, status: { $ne:'archived' } } }, { $group: { _id:'$currency', total:{$sum:'$capital'} } }]) : [];
  res.json({ capitalByCurrency, students,courses,installments,internships,accounts,performances,movements,usdt,leads,clients,proposals,products,subscriptions,renewals,projects,milestones,atRisk,invoices,expenses,transfers,approvals });
}));
export default router;
