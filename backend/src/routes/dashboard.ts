import { Router } from 'express';
import { Task, Event, ApprovalRequest, Lead, Project, Student, Installment, TradingAccount, Invoice, Expense, Subscription, Company, AuditLog } from '../models.js';
import { allowedCompanies, scopedQuery, wrap, HttpError } from '../lib/security.js';
import { D } from '../lib/finance.js';
const router = Router();
const sumMoney = (items: any[], field: string) => items.reduce((s, x) => s.plus(D(x[field]?.toString() || 0)), D(0)).toFixed(2);
router.get('/summary', wrap(async (req, res) => {
    const now = new Date();
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const ids = req.companyIds || [];
    if (!ids.length)
        throw new HttpError(403, 'No companies assigned');
    // A Team user may have Learning, Finance or Approvals but no Operations.
    // An empty authorized company set is a valid dashboard scope, not a 403.
    const match = (domain: string) => ({ companyId: { $in: allowedCompanies(req, domain) } });
    const totalsByCurrency = (list: any[], value: (r: any) => string) => Object.fromEntries([...new Set(list.map(r => r.currency || 'INR'))].map(currency => [currency, list.filter(r => (r.currency || 'INR') === currency).reduce((sum, r) => sum.plus(D(value(r))), D(0)).toFixed(2)]));
    const [tasks, events, approvals, leads, projects, students, installments, tradingAccounts, invoices, expenses, subscriptions] = await Promise.all([
        allowedCompanies(req, 'operations').length ? Task.find(match('operations')).sort({ dueAt: 1 }).limit(500).lean() : [],
        allowedCompanies(req, 'operations').length ? Event.find({ ...match('operations'), startAt: { $gte: now } }).sort({ startAt: 1 }).limit(20).lean() : [],
        allowedCompanies(req, 'approvals').length ? ApprovalRequest.find(match('approvals')).sort({ createdAt: -1 }).limit(30).lean() : [],
        allowedCompanies(req, 'sales').length ? Lead.find(match('sales')).limit(500).lean() : [],
        allowedCompanies(req, 'projects').length ? Project.find(match('projects')).limit(500).lean() : [],
        allowedCompanies(req, 'learning').length ? Student.find(match('learning')).limit(500).lean() : [],
        allowedCompanies(req, 'learning').length ? Installment.find(match('learning')).limit(500).lean() : [],
        allowedCompanies(req, 'advisory').length ? TradingAccount.find(match('advisory')).limit(500).lean() : [],
        allowedCompanies(req, 'finance').length ? Invoice.find(match('finance')).limit(500).lean() : [],
        allowedCompanies(req, 'finance').length ? Expense.find(match('finance')).limit(500).lean() : [],
        allowedCompanies(req, 'products').length ? Subscription.find(match('products')).limit(500).lean() : [],
    ]);
    const activeTasks = tasks.filter(t => !['completed', 'archived'].includes(t.status));
    const pendingApprovals = approvals.filter(a => a.status === 'pending');
    const pendingInstallments = installments.filter(i => i.status !== 'paid');
    const dueToday = activeTasks.filter(t => t.dueAt && new Date(t.dueAt) <= dayEnd && new Date(t.dueAt).toDateString() === now.toDateString()).length;
    const overdue = activeTasks.filter(t => t.dueAt && new Date(t.dueAt) < new Date(now.toDateString())).length;
    const upcoming = events.filter(e => e.startAt && new Date(e.startAt) <= new Date(now.getTime() + 7 * 86400000));
    const companies = await Company.find({ _id: { $in: ids }, tenantId:req.actor!.tenantId,active:true })
      .select('name code vertical currency enabledModules').sort({name:1}).lean();
    const countIn=(list:any[],companyId:string)=>list.filter(x=>String(x.companyId)===companyId).length;
    const companySummaries=companies.map(c=>{
      const id=String(c._id);
      const modules=(req.actor!.companyModules[id]||[])
        .filter(m=>allowedCompanies(req,m).includes(id));
      const available=(domain:string)=>modules.includes(domain);
      return {id,name:c.name,code:c.code,vertical:c.vertical,currency:c.currency,modules,
        counts:{tasks:available('operations')?countIn(tasks,id):0,
          leads:available('sales')?countIn(leads,id):0,
          students:available('learning')?countIn(students,id):0,
          tradingAccounts:available('advisory')?countIn(tradingAccounts,id):0,
          projects:available('projects')?countIn(projects,id):0,
          subscriptions:available('products')?countIn(subscriptions,id):0}};
    });
    res.json({
        companySummaries,
        stats: { dueToday, overdue, followUps: leads.filter(l => l.followUpAt && new Date(l.followUpAt) <= dayEnd && !['won', 'lost'].includes(l.stage)).length, approvals: pendingApprovals.length },
        verticals: { learning: { students: students.length, dueFees: sumMoney(pendingInstallments.map(i => ({ remaining: D(i.amount?.toString()).minus(D(i.paidAmount?.toString())) })), 'remaining'), batches: 0 },
            advisory: { accounts: tradingAccounts.length, capitalByCurrency: totalsByCurrency(tradingAccounts, (r: any) => r.capital?.toString() || '0') },
            products: { projects: projects.filter(p => !['completed', 'archived'].includes(p.status)).length, subscriptions: subscriptions.filter(s => s.status === 'active').length },
        },
        tasks: tasks.slice(0, 15), attention: [...pendingApprovals.slice(0, 4).map(a => ({ id: a._id, title: a.title, kind: 'approval', target: '/approvals' })), ...activeTasks.filter(t => t.dueAt && new Date(t.dueAt) < now).slice(0, 4).map(t => ({ id: t._id, title: t.title, kind: 'overdue', target: '/work-board' }))].slice(0, 8),
        upcoming, finance: { receivablesByCurrency: totalsByCurrency(invoices.filter(i => i.status !== 'paid'), (i: any) => D(i.amount?.toString()).minus(D(i.paidAmount?.toString())).toFixed(2)), expensesByCurrency: totalsByCurrency(expenses, (i: any) => i.amount?.toString() || '0') },
    });
}));
router.get('/reports', wrap(async (req, res) => {
    const ids = req.companyIds || [];
    const companies = await Company.find({ _id: { $in: ids } }).select('name code currency').lean();
    const allowed = async (domain: string, M: any) => allowedCompanies(req, domain).length ? M.find({ $and: [scopedQuery(req, domain)] }).limit(3000).lean() : [];
    const [leads, projects, students, invoices, expenses, approvals, tasks, accounts] = await Promise.all([
        allowed('sales', Lead), allowed('projects', Project), allowed('learning', Student), allowed('finance', Invoice), allowed('finance', Expense), allowed('approvals', ApprovalRequest), allowed('operations', Task), allowed('advisory', TradingAccount),
    ]);
    // No cross-currency totals: all money summaries grouped by currency to prevent misleading aggregates.
    const byCurrency = (records: any[], key: string) => Object.fromEntries([...new Set(records.map(r => r.currency || 'INR'))].map(currency => [currency, sumMoney(records.filter(r => (r.currency || 'INR') === currency), key)]));
    const moduleNames=['operations','learning','advisory','sales','products','projects','finance','approvals','reports'];
    const availableModules=moduleNames.filter(m=>allowedCompanies(req,m).length>0);
    res.json({ companies,availableModules, counts: { tasks: tasks.length, tasksCompleted: tasks.filter((v: any) => v.status === 'completed').length, leads: leads.length, leadsWon: leads.filter((v: any) => v.stage === 'won').length, projects: projects.length, projectsAtRisk: projects.filter((v: any) => v.risk !== 'on-track').length, students: students.length, pendingApprovals: approvals.filter((v: any) => v.status === 'pending').length, tradingAccounts: accounts.length }, financials: { pipeline: byCurrency(leads, 'amount'), invoiced: byCurrency(invoices, 'amount'), expenses: byCurrency(expenses, 'amount') }, pipelineStages: Object.entries(leads.reduce((agg: any, v: any) => ({ ...agg, [v.stage]: (agg[v.stage] || 0) + 1 }), {})), taskStages: Object.entries(tasks.reduce((agg: any, v: any) => ({ ...agg, [v.status]: (agg[v.status] || 0) + 1 }), {})), projects: projects.slice(0, 20) });
}));
export default router;
