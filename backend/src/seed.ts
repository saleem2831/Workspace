import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Company, User, Membership, Task, TaskUpdate, Event, Student, Course, Batch, Installment, Internship, TradingAccount, DailyPerformance, CapitalMovement, Client, Lead, Proposal, Product, Subscription, Project, Milestone, Invoice, Expense, Transfer, ApprovalRequest } from './models.js';
import { config, validateConfig } from './config.js';
import { modulesForVertical } from './lib/company-modules.js';
validateConfig();
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@bitstek.local';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminPassword || adminPassword.length < 12 || adminPassword.startsWith('replace-with')) {
    console.error('Set SEED_ADMIN_PASSWORD (12+ characters) in apps/api/.env before running seed');
    process.exit(1);
}
await mongoose.connect(config.mongoUri);
const date = (offset: number, hour = 11) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d; };
const upsert = async (M: any, filter: Record<string, unknown>, data: any) => M.findOneAndUpdate(filter, { $setOnInsert: data }, { upsert: true, new: true, setDefaultsOnInsert: true });
const companyData = [
    { name: 'Bitstek Learning', code: 'BTL', vertical: 'Learning', currency: 'INR' },
    { name: 'Bitstek Advisory', code: 'BTA', vertical: 'Advisory', currency: 'INR' },
    { name: 'Bitstek IT & Products', code: 'BTI', vertical: 'IT & Products', currency: 'INR' },
];
const companies: any[] = [];
for (const c of companyData)
    companies.push(await upsert(Company, { code: c.code }, {...c,enabledModules:modulesForVertical(c.vertical)}));
const admin = await User.findOneAndUpdate({ email: adminEmail.toLowerCase() }, { $setOnInsert: { name: 'Workspace Admin', passwordHash: await bcrypt.hash(adminPassword, 12), active: true }, $set:{isSuperAdmin:true} }, { upsert: true, new: true });
for (const c of companies)
    await upsert(Membership, { companyId: c._id, userId: admin._id }, { role: 'owner', active: true });
const financeEmail = 'finance-demo@bitstek.local';
const finance = await User.findOneAndUpdate({ email: financeEmail }, { $setOnInsert: { name: 'Finance Reviewer', passwordHash: await bcrypt.hash(adminPassword, 12), active: true } }, { upsert: true, new: true });
for (const c of companies)
    await upsert(Membership, { companyId: c._id, userId: finance._id }, { role: 'team', permissions:['finance:write','approvals:write','reports:read'], active: true });
const [learning, advisory, it] = companies;
const common = (c: any) => ({ companyId: c._id, createdBy: admin._id });
const taskSpecs = [
    ['Collect fee installment — Cohort B', learning, 'ready', 'P1', -1],
    ['Prepare client demo — Advisory', advisory, 'in-progress', 'P1', 0],
    ['Reconcile trading statement — October', advisory, 'in-progress', 'P2', 1],
    ['Review product release notes — v2.1', it, 'review', 'P2', 3],
    ['Approve internship stipend', learning, 'completed', 'P2', -1],
    ['Design next cohort curriculum', learning, 'backlog', 'P3', 7],
    ['Set up Q4 marketing campaign', it, 'backlog', 'P3', 9],
    ['Client data for analysis', advisory, 'waiting', 'P2', 2],
    ['Send growth proposal follow-up', advisory, 'ready', 'P2', 0],
];
for (const [title, c, status, priority, days] of taskSpecs as any) {
    const doc = await upsert(Task, { title, companyId: c._id }, { ...common(c), title, status, priority, ownerId: admin._id, vertical: c.vertical, dueAt: date(days), description: 'Follow up with the responsible team and provide an update.' });
    await upsert(TaskUpdate, { taskId: doc._id, kind: 'created' }, { ...common(c), taskId: doc._id, userId: admin._id, message: 'Task created from operations plan', kind: 'created' });
}
for (const [title, c, days, type] of [
    ['Client demo — Advisory', advisory, 1, 'client-demo'], ['Cohort B — live session', learning, 2, 'training'], ['Product release — v2.1', it, 4, 'release'], ['Monthly finance review', it, 5, 'finance-review'],
] as any)
    await upsert(Event, { title, companyId: c._id }, { ...common(c), title, startAt: date(days, 14), endAt: date(days, 15), dueAt: date(days), type, status: 'scheduled', vertical: c.vertical });
const course1 = await upsert(Course, { title: 'Full Stack Development', companyId: learning._id }, { ...common(learning), title: 'Full Stack Development', fee: '45000', durationWeeks: 16, instructor: 'Rohan Mehta', status: 'active' });
const course2 = await upsert(Course, { title: 'AI & Machine Learning', companyId: learning._id }, { ...common(learning), title: 'AI & Machine Learning', fee: '65000', durationWeeks: 20, instructor: 'Aisha Khan', status: 'active' });
const batch1 = await upsert(Batch, { title: 'Cohort B — Full Stack', companyId: learning._id }, { ...common(learning), title: 'Cohort B — Full Stack', courseId: course1._id, instructor: 'Rohan Mehta', startsAt: date(-12), endsAt: date(75), seats: 30, status: 'active' });
const batch2 = await upsert(Batch, { title: 'Cohort A — AI Foundations', companyId: learning._id }, { ...common(learning), title: 'Cohort A — AI Foundations', courseId: course2._id, instructor: 'Aisha Khan', startsAt: date(-20), endsAt: date(110), seats: 25, status: 'active' });
const students = [];
for (const [name, batch, course, fees, outstanding] of [
    ['Aisha Khan', batch1, course1, '45000', '15000'], ['Rahul Shah', batch1, course1, '45000', '20000'], ['Meera Iyer', batch2, course2, '65000', '10000'], ['Karan Singh', batch2, course2, '65000', '30000']
] as any)
    students.push(await upsert(Student, { title: name, companyId: learning._id }, { ...common(learning), title: name, status: 'active', courseId: course._id, batchId: batch._id, totalFees: fees, outstanding, enrollmentDate: date(-30), mentor: 'Rohan Mehta' }));
for (const [idx, s] of students.entries())
    await upsert(Installment, { title: `Installment ${idx + 1} — ${s.title}`, companyId: learning._id }, { ...common(learning), title: `Installment ${idx + 1} — ${s.title}`, studentId: s._id, amount: s.outstanding, paidAmount: '0', dueAt: date(idx - 1), status: 'pending' });
await upsert(Internship, { title: 'Web Intern — Aisha Khan', companyId: learning._id }, { ...common(learning), title: 'Web Intern — Aisha Khan', studentId: students[0]._id, stipend: '8500', startAt: date(-5), endAt: date(45), supervisor: 'Engineering Team', status: 'active' });
const acc = await upsert(TradingAccount, { title: 'Funded Account — Alpha', companyId: advisory._id }, { ...common(advisory), title: 'Funded Account — Alpha', broker: 'Demo Broker', accountNumber: 'DEMO-A001', trader: 'Karan Singh', capital: '3000000', realizedPnL: '18400', unrealizedPnL: '-2100', currency: 'INR', status: 'active' });
await upsert(TradingAccount, { title: 'Funded Account — Beta', companyId: advisory._id }, { ...common(advisory), title: 'Funded Account — Beta', broker: 'Demo Broker', accountNumber: 'DEMO-B002', trader: 'Rahul Shah', capital: '2000000', realizedPnL: '11200', unrealizedPnL: '-800', currency: 'INR', status: 'active' });
for (const [day, pnl] of [[-2, '7500'], [-1, '-1500'], [0, '11400']] as any)
    await upsert(DailyPerformance, { sourceKey: `DEMO-A001-${day}`, companyId: advisory._id }, { ...common(advisory), title: `Alpha statement ${date(day).toDateString()}`, sourceKey: `DEMO-A001-${day}`, tradingAccountId: acc._id, performanceDate: date(day), realizedPnL: pnl, unrealizedPnL: '0', fees: '100', reconciled: day !== 0, status: day === 0 ? 'pending-reconciliation' : 'reconciled' });
const client1 = await upsert(Client, { title: 'Dubai Retail Co.', companyId: advisory._id }, { ...common(advisory), title: 'Dubai Retail Co.', email: 'sales@example.org', country: 'UAE', industry: 'Retail', status: 'active' });
for (const [title, company, stage, amount, due] of [
    ['Website redesign', advisory, 'proposal', '300000', 1], ['Growth advisory mandate', advisory, 'negotiation', '2850000', 0], ['Hospital CRM', it, 'discovery', '1250000', 2], ['Learning platform rollout', learning, 'qualified', '600000', 3], ['Analytics engagement', advisory, 'won', '180000', -1],
] as any)
    await upsert(Lead, { title, companyId: company._id }, { ...common(company), title, stage, amount, currency: 'INR', clientId: company._id === advisory._id ? client1._id : undefined, followUpAt: date(due), status: 'active', contact: 'Client contact', ownerId: admin._id });
await upsert(Proposal, { title: 'Growth advisory — Proposal v1', companyId: advisory._id }, { ...common(advisory), title: 'Growth advisory — Proposal v1', amount: '2850000', version: 1, sentAt: date(-3), validUntil: date(20), status: 'sent' });
const p1 = await upsert(Product, { title: 'NexERP', companyId: it._id }, { ...common(it), title: 'NexERP', sku: 'NEX-ERP', category: 'Enterprise SaaS', price: '128000', billingCycle: 'yearly', status: 'active' });
const p2 = await upsert(Product, { title: 'VerifiAI', companyId: it._id }, { ...common(it), title: 'VerifiAI', sku: 'VER-AI', category: 'AI tools', price: '48000', billingCycle: 'yearly', status: 'active' });
for (const [title, p, days, amount] of [['Acme India — NexERP', p1, 10, '128000'], ['Retail Partners — VerifiAI', p2, 22, '48000'], ['Enterprise Group — NexERP', p1, 40, '128000']] as any)
    await upsert(Subscription, { title, companyId: it._id }, { ...common(it), title, customer: title.split(' — ')[0], productId: p._id, startAt: date(-330), renewAt: date(days), amount, currency: 'INR', billingCycle: 'yearly', status: 'active' });
const project1 = await upsert(Project, { title: 'Retail website rollout', companyId: it._id }, { ...common(it), title: 'Retail website rollout', manager: 'Karan Singh', region: 'UAE', progress: 75, budget: '450000', risk: 'on-track', startsAt: date(-45), dueAt: date(20), status: 'in-progress' });
await upsert(Project, { title: 'Dealer portal', companyId: it._id }, { ...common(it), title: 'Dealer portal', manager: 'Rahul Shah', region: 'Saudi', progress: 44, budget: '850000', risk: 'at-risk', dueAt: date(7), status: 'in-progress' });
await upsert(Project, { title: 'Mobile app', companyId: it._id }, { ...common(it), title: 'Mobile app', manager: 'Aisha Khan', region: 'India', progress: 28, budget: '625000', risk: 'on-track', dueAt: date(28), status: 'in-progress' });
for (const [title, pct, days] of [['Discovery', 100, -20], ['Design review', 100, -5], ['Development', 70, 8], ['Deployment', 0, 20]] as any)
    await upsert(Milestone, { title, companyId: it._id }, { ...common(it), title, projectId: project1._id, progress: pct, dueAt: date(days), status: pct === 100 ? 'completed' : 'in-progress' });
await upsert(Invoice, { number: 'INV-DEMO-001', companyId: it._id }, { ...common(it), title: 'Retail project milestone invoice', number: 'INV-DEMO-001', amount: '225000', paidAmount: '0', currency: 'INR', issuedAt: date(-2), dueAt: date(15), status: 'sent' });
await upsert(Invoice, { number: 'INV-DEMO-002', companyId: learning._id }, { ...common(learning), title: 'Corporate training invoice', number: 'INV-DEMO-002', amount: '75000', paidAmount: '0', currency: 'INR', issuedAt: date(-3), dueAt: date(12), status: 'sent' });
const expense = await upsert(Expense, { title: 'Team equipment reimbursement', companyId: it._id }, { ...common(it), title: 'Team equipment reimbursement', vendor: 'Office Supplies', category: 'Operations', amount: '24800', currency: 'INR', status: 'pending' });
await upsert(ApprovalRequest, { recordType: 'expenses', recordId: expense._id, companyId: it._id }, { ...common(it), title: 'Approve: Team equipment reimbursement', recordType: 'expenses', recordId: expense._id, requestedBy: admin._id, amount: '24800', currency: 'INR', status: 'pending' });
const movement = await upsert(CapitalMovement, { title: 'Account capital top-up', companyId: advisory._id }, { ...common(advisory), title: 'Account capital top-up', tradingAccountId: acc._id, amount: '50000', currency: 'INR', direction: 'deposit', status: 'pending' });
await upsert(ApprovalRequest, { recordType: 'capitalMovements', recordId: movement._id, companyId: advisory._id }, { ...common(advisory), title: 'Approve: Account capital top-up', recordType: 'capitalMovements', recordId: movement._id, requestedBy: admin._id, amount: '50000', currency: 'INR', status: 'pending' });
console.log(`Seed complete: ${companies.length} companies, 2 test users. Owner: ${adminEmail}, reviewer: ${financeEmail}. Password is SEED_ADMIN_PASSWORD from environment.`);
await mongoose.disconnect();
