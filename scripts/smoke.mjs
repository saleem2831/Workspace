/**
 * Bitstek Workspace backend integration smoke suite (Node 20+).
 * This test writes uniquely-prefixed TEST DATA to the configured database.
 * Run ONLY against a disposable local/staging database after npm run seed.
 *
 * Requires: BASE_URL=http://127.0.0.1:5000 (default),
 *           SEED_ADMIN_PASSWORD=<password from backend/.env>,
 *           SMOKE_ALLOW_WRITES=true.
 *
 * Uses only Node built-ins. This is an API integration test, not a browser test.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverEnvFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', '.env');
if (fs.existsSync(serverEnvFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(serverEnvFile);
}

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@bitstek.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const prefix = `SMOKE-${crypto.randomBytes(5).toString('hex')}`;
const failures = [];
let passed = 0;

if (process.env.SMOKE_ALLOW_WRITES !== 'true') {
  console.error('Refusing to write test records. Set SMOKE_ALLOW_WRITES=true for an isolated development database.');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Do not run the smoke suite with NODE_ENV=production.');
  process.exit(2);
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.startsWith('replace-with')) {
  console.error('Set SEED_ADMIN_PASSWORD to the same demo password used with npm run seed.');
  process.exit(2);
}

async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
    return detail;
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error.stack || error}`);
    throw error;
  }
}

class Client {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.cookies = new Map();
    this.company = 'all';
  }
  async request(method, path, body, expect = 200, extraHeaders = {}) {
    const cookieString = [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    const headers = {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookieString ? { cookie: cookieString } : {}),
      'x-company-id': this.company,
      ...extraHeaders,
    };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['x-csrf-token'] = this.cookies.get('bitstek_csrf') || '';
    }
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';')[0].split('=');
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    assert.equal(response.status, expect, `${method} ${path}: expected ${expect}, got ${response.status}: ${raw.slice(0, 500)}`);
    return data;
  }
  get(path, status = 200) { return this.request('GET', path, undefined, status); }
  post(path, body, status = 200) { return this.request('POST', path, body, status); }
  patch(path, body, status = 200) { return this.request('PATCH', path, body, status); }
  delete(path, status = 200) { return this.request('DELETE', path, undefined, status); }
  async login() { await this.post('/api/auth/login', { email: this.email, password: this.password }); }
}

const owner = new Client(ADMIN_EMAIL, ADMIN_PASSWORD);
const reviewer = new Client('finance-demo@bitstek.local', ADMIN_PASSWORD);
const unauthenticated = new Client('', '');

async function main() {
  await test('API liveness and database readiness', async () => {
    assert.equal((await owner.get('/api/health')).ok, true);
    assert.equal((await owner.get('/api/ready')).database, 'connected');
  });
  await test('Unauthorized access rejected', async () => {
    await unauthenticated.get('/api/dashboard/summary', 401);
  });
  await test('Authentication, CSRF and session cookies', async () => {
    await owner.post('/api/auth/login', { email: ADMIN_EMAIL, password: 'incorrect-password' }, 401);
    await owner.login();
    await reviewer.login();
    assert.ok(owner.cookies.has('bitstek_session'));
    assert.ok(owner.cookies.has('bitstek_csrf'));
    const noCsrf = await owner.request('POST', '/api/records/tasks', { title: prefix }, 403, {
      'x-csrf-token': 'bad-csrf-token',
    });
    assert.ok(noCsrf.error);
  });

  const session = await test('Company memberships and workspace settings', async () => {
    const me = await owner.get('/api/auth/me');
    assert.ok(me.companies.length >= 3);
    assert.equal(me.user.email, ADMIN_EMAIL);
    await owner.get('/api/admin/companies');
    await owner.get('/api/admin/users');
    return me;
  });

  const getByCode = (code) => {
    const company = session.companies.find((v) => v.code === code);
    assert.ok(company, `Seed company ${code} missing`);
    return company._id;
  };
  const IT = getByCode('BTI');
  const LEARNING = getByCode('BTL');
  const ADVISORY = getByCode('BTA');
  owner.company = IT;
  reviewer.company = IT;

  await test('All-company dashboards and reporting', async () => {
    owner.company = 'all';
    assert.ok((await owner.get('/api/dashboard/summary')).stats);
    assert.ok((await owner.get('/api/dashboard/reports')).counts);
    owner.company = IT;
  });

  const recordKinds = {
    tasks: { title: `${prefix} task`, status: 'backlog', priority: 'P2' },
    events: { title: `${prefix} event`, startAt: '2031-01-15T10:00:00.000Z', endAt: '2031-01-15T11:00:00.000Z' },
    clients: { title: `${prefix} client`, email: 'smoke@example.test' },
    products: { title: `${prefix} product`, sku: prefix, price: '500' },
    projects: { title: `${prefix} project`, budget: '5000', progress: 10, status: 'planning' },
    invoices: { title: `${prefix} invoice`, number: `${prefix}-INV`, amount: '1000', currency: 'INR' },
    expenses: { title: `${prefix} expense`, vendor: 'Smoke Testing', amount: '500.00', currency: 'INR' },
    transfers: { title: `${prefix} transfer`, targetCompanyId: ADVISORY, amount: '200', currency: 'INR' },
  };
  const created = {};
  await test('Create + read records in core modules', async () => {
    for (const [kind, payload] of Object.entries(recordKinds)) {
      created[kind] = await owner.post(`/api/records/${kind}`, payload, 201);
      assert.ok(created[kind]._id, `Missing ${kind} ID`);
      const read = await owner.get(`/api/records/${kind}/${created[kind]._id}`);
      assert.equal(read.title, payload.title);
    }
    assert.equal(created.invoices.status, 'draft');
    assert.equal(created.expenses.status, 'pending');
  });

  await test('Task updates, board status and archive', async () => {
    await owner.post(`/api/workflows/tasks/${created.tasks._id}/updates`, { message: `${prefix} task note` }, 201);
    const notes = await owner.get(`/api/workflows/tasks/${created.tasks._id}/updates`);
    assert.ok(notes.length >= 1);
    const updated = await owner.patch(`/api/records/tasks/${created.tasks._id}`, { status: 'completed' });
    assert.equal(updated.status, 'completed');
    assert.ok(updated.completedAt);
    await owner.delete(`/api/records/tasks/${created.tasks._id}`);
  });

  await test('Calendar rejects invalid event windows', async () => {
    await owner.post('/api/records/events', {
      title: `${prefix} invalid event`, startAt: '2031-01-15T13:00:00.000Z',
      endAt: '2031-01-15T12:00:00.000Z',
    }, 400);
    await owner.patch(`/api/records/events/${created.events._id}`, {
      endAt: '2031-01-15T09:00:00.000Z',
    }, 400);
  });

  await test('Project milestones correctly retain projectId', async () => {
    const milestone = await owner.post('/api/records/milestones', {
      title: `${prefix} milestone`, projectId: created.projects._id, progress: 25,
    }, 201);
    assert.equal(String(milestone.projectId), created.projects._id);
    await owner.patch(`/api/records/milestones/${milestone._id}`, { progress: 100 });
  });

  await test('Products and subscriptions', async () => {
    const subscription = await owner.post('/api/records/subscriptions', {
      title: `${prefix} subscription`, productId: created.products._id,
      amount: '300', startAt: '2031-01-01T00:00:00.000Z',
      renewAt: '2032-01-01T00:00:00.000Z',
    }, 201);
    assert.equal(subscription.productId, created.products._id);
  });

  await test('Sales pipeline, lead conversion and idempotency', async () => {
    const lead = await owner.post('/api/records/leads', {
      title: `${prefix} won deal`, clientId: created.clients._id,
      amount: '9500', stage: 'won',
    }, 201);
    const project = await owner.post(`/api/workflows/leads/${lead._id}/convert`, {});
    assert.equal(project.leadId, lead._id);
    const retry = await owner.post(`/api/workflows/leads/${lead._id}/convert`, {});
    assert.equal(retry._id, project._id);
    await owner.post('/api/records/proposals', {
      title: `${prefix} proposal`, leadId: lead._id, amount: '9500',
    }, 201);
  });

  await test('Company isolation and invalid money', async () => {
    owner.company = LEARNING;
    await owner.get(`/api/records/projects/${created.projects._id}`, 404);
    owner.company = IT;
    await owner.post('/api/records/expenses', { title: 'Invalid negative', amount: '-5.00' }, 400);
    await owner.post('/api/records/expenses', { title: 'Invalid precision', amount: '1.001' }, 400);
  });

  await test('Maker/checker approvals and journal posting', async () => {
    const approvals = await owner.get('/api/records/approvals');
    const request = approvals.items.find((v) => v.recordId === created.expenses._id);
    assert.ok(request, 'Expense approval was not created');
    await owner.post(`/api/workflows/approvals/${request._id}/decision`, { decision: 'approved' }, 403);
    const approved = await reviewer.post(`/api/workflows/approvals/${request._id}/decision`, { decision: 'approved' });
    assert.equal(approved.status, 'approved');
    const posting = await owner.post(`/api/workflows/finance/post/expenses/${created.expenses._id}`, {});
    assert.equal(posting.journalEntries.length, 1);
    await owner.post(`/api/workflows/finance/post/expenses/${created.expenses._id}`, {}, 409);
    await owner.patch(`/api/records/expenses/${created.expenses._id}`, { amount: '999999' }, 409);
  });

  await test('Invoice lifecycle and partial/full receipts', async () => {
    await owner.patch(`/api/records/invoices/${created.invoices._id}`, { status: 'sent' });
    await owner.post(`/api/workflows/finance/post/invoices/${created.invoices._id}`, {});
    const r1 = await owner.post(`/api/workflows/invoices/${created.invoices._id}/collect`, {
      amount: '200', reference: `${prefix}-PAY1`,
    });
    assert.equal(r1.amount.$numberDecimal, '200');
    await owner.post(`/api/workflows/invoices/${created.invoices._id}/collect`, {
      amount: '900', reference: `${prefix}-OVERPAY`,
    }, 409);
    await owner.post(`/api/workflows/invoices/${created.invoices._id}/collect`, {
      amount: '800', reference: `${prefix}-PAY2`,
    });
    const invoice = await owner.get(`/api/records/invoices/${created.invoices._id}`);
    assert.equal(invoice.status, 'paid');
    await owner.patch(`/api/records/invoices/${created.invoices._id}`, { amount: '1500' }, 409);
  });

  await test('Intercompany transfer creates paired journals', async () => {
    const approvals = await owner.get('/api/records/approvals');
    const request = approvals.items.find((a) => a.recordId === created.transfers._id);
    assert.ok(request);
    await reviewer.post(`/api/workflows/approvals/${request._id}/decision`, { decision: 'approved' });
    const result = await owner.post(`/api/workflows/finance/post/transfers/${created.transfers._id}`, {});
    assert.equal(result.journalEntries.length, 2);
  });

  await test('Learning courses, batches, fees, receipts, internships', async () => {
    owner.company = LEARNING;
    const course = await owner.post('/api/records/courses', { title: `${prefix} course`, fee: '2000' }, 201);
    const batch = await owner.post('/api/records/batches', {
      title: `${prefix} batch`, courseId: course._id, seats: 15,
    }, 201);
    const student = await owner.post('/api/records/students', {
      title: `${prefix} learner`, courseId: course._id,
      batchId: batch._id, totalFees: '2000',
    }, 201);
    await owner.post('/api/records/internships', {
      title: `${prefix} internship`, studentId: student._id, stipend: '500',
    }, 201);
    const installment = await owner.post('/api/workflows/installments/schedule', {
      studentId: student._id, title: `${prefix} installment`,
      amount: '2000', dueAt: '2031-01-20',
    }, 201);
    const r1 = await owner.post(`/api/workflows/installments/${installment._id}/collect`, {
      amount: '500', reference: `${prefix}-FEE1`,
    });
    assert.equal(r1.status, 'received');
    await owner.post(`/api/workflows/installments/${installment._id}/collect`, {
      amount: '1600', reference: `${prefix}-FEE-OVER`,
    }, 409);
    const studentUpdated = await owner.get(`/api/records/students/${student._id}`);
    assert.equal(studentUpdated.outstanding.$numberDecimal, '1500.00');
  });

  await test('Advisory trading and statement import de-duplication', async () => {
    owner.company = ADVISORY;
    const account = await owner.post('/api/records/tradingAccounts', {
      title: `${prefix} trading account`, broker: 'Demo',
      accountNumber: prefix, capital: '10000',
    }, 201);
    const csv = `sourceKey,date,realizedPnL,unrealizedPnL,fees\n${prefix}-T1,2031-01-01,20,-3,0.5\n${prefix}-T1,2031-01-01,20,-3,0.5\n`;
    const result = await owner.post('/api/workflows/advisory/import-performance', {
      tradingAccountId: account._id, csv,
    });
    assert.equal(result.imported, 1);
    assert.equal(result.duplicates, 1);
    const second = await owner.post('/api/workflows/advisory/import-performance', {
      tradingAccountId: account._id, csv,
    });
    assert.equal(second.imported, 0);
    const movement = await owner.post('/api/records/capitalMovements', {
      title: `${prefix} capital`, tradingAccountId: account._id,
      amount: '250', direction: 'deposit',
    }, 201);
    assert.equal(movement.status, 'pending');
  });

  await test('RBAC: new employee cannot see finance or foreign company', async () => {
    owner.company = IT;
    const employeeEmail = `${prefix.toLowerCase()}@example.test`;
    const employeePassword = `${prefix}-secret-1234`;
    await owner.post('/api/admin/users', {
      name: `${prefix} employee`, email: employeeEmail,
      password: employeePassword, role: 'employee',
    }, 201);
    const employee = new Client(employeeEmail, employeePassword);
    employee.company = IT;
    await employee.login();
    await employee.get('/api/records/expenses', 403);
    employee.company = LEARNING;
    await employee.get('/api/records/tasks', 403);
    employee.company = IT;
    const ownTask = await employee.post('/api/records/tasks', {
      title: `${prefix} employee task`, status: 'ready',
    }, 201);
    assert.equal(ownTask.createdBy, (await employee.get('/api/auth/me')).user.id);
    await employee.patch(`/api/records/tasks/${ownTask._id}`, { status: 'completed' });
  });

  await test('Audit, journal read, status and logout', async () => {
    owner.company = IT;
    const logs = await owner.get('/api/admin/audit');
    assert.ok(logs.length > 0);
    const journals = await owner.get('/api/workflows/finance/journals');
    assert.ok(journals.length > 0);
    await owner.post('/api/auth/logout', {});
    await owner.get('/api/auth/me', 401);
  });
}

console.log(`Bitstek Workspace API smoke | ${prefix} | ${BASE_URL}`);
try {
  await main();
  console.log(`\nSUCCESS: ${passed} smoke groups passed; TEST DATA prefix ${prefix}`);
} catch {
  console.error(`\nFAILED: ${passed} smoke groups passed, ${failures.length} failed.`);
  console.error('Inspect the first failed operation and repeat using a fresh disposable database.');
  process.exitCode = 1;
}
