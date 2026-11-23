import assert from 'node:assert/strict';
import { test } from 'node:test';
import { due8To30Count, filterRenewals } from '../src/pages/renewalFilters.ts';
const row = (title, daysUntil, status = 'active', extra = {}) => ({
  title, daysUntil, status, alert: daysUntil < 0 ? 'overdue' : daysUntil <= 15 ? 'due-soon' : 'upcoming',
  nextDueAt: `2026-12-${String(Math.max(daysUntil, 1)).padStart(2, '0')}`, amount: '100.00',
  frequency: 'monthly', category: 'SaaS', ...extra
});
const rows = [row('Overdue', -2), row('Due today', 0), row('Due seven', 7), row('Due eight', 8), row('Due 30', 30), row('Due 31', 31), row('Paused', 5, 'paused'), row('Cancelled', -1, 'cancelled')];
const base = { search: '', frequency: 'all', sort: 'name', status: 'all', metric: 'all' };
test('summary 8–30 days removes 0–7 overlap', () => {
  assert.equal(due8To30Count({ due7: 3, due30: 10 }), 7);
  assert.equal(due8To30Count({ due7: 0, due30: 0 }), 0);
});
test('KPI filters use inclusive date boundaries and exclude paused/cancelled', () => {
  assert.deepEqual(filterRenewals(rows, { ...base, metric: 'due7' }).map(x => x.title), ['Due seven', 'Due today']);
  assert.deepEqual(filterRenewals(rows, { ...base, metric: 'due8to30' }).map(x => x.title), ['Due 30', 'Due eight']);
  assert.deepEqual(filterRenewals(rows, { ...base, metric: 'overdue' }).map(x => x.title), ['Overdue']);
  assert.equal(filterRenewals(rows, { ...base, metric: 'active' }).length, 6);
});
test('status, frequency, search and sorting combine without changing original rows', () => {
  const other = row('AWS Hosting', 6, 'active', { vendorName: 'Amazon', frequency: 'yearly', amount: { $numberDecimal: '200.25' } });
  const input = [...rows, other];
  assert.deepEqual(filterRenewals(input, { ...base, search: 'AMAZON', frequency: 'yearly' }).map(x => x.title), ['AWS Hosting']);
  assert.equal(filterRenewals(input, { ...base, status: 'paused' }).length, 1);
  assert.deepEqual(filterRenewals([row('B', 3, 'active', { amount: '4.00' }), other], { ...base, sort: 'amount-desc' }).map(x => x.title), ['AWS Hosting', 'B']);
  assert.equal(input[0].title, 'Overdue');
});
test('alert filters ignore paused and cancelled even if malformed alert was returned', () => {
  const input = [row('A', 1, 'active'), row('B', 1, 'paused', { alert: 'due-soon' })];
  assert.deepEqual(filterRenewals(input, { ...base, status: 'due-soon' }).map(x => x.title), ['A']);
});
