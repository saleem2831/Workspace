import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurrenceMonths, renewalNextDue, renewalState, recurrenceAnchor, utcDate, DEFAULT_REMINDER_DAYS } from '../lib/renewals.js';
import { positiveAmount } from '../lib/finance.js';
import { roleAllows } from '../lib/access.js';

test('renewal schedule supports each recurrence and rejects invalid intervals',()=>{
  assert.equal(recurrenceMonths('monthly'),1);
  assert.equal(recurrenceMonths('quarterly'),3);
  assert.equal(recurrenceMonths('half-yearly'),6);
  assert.equal(recurrenceMonths('yearly'),12);
  assert.equal(recurrenceMonths('custom',9),9);
  for(const bad of [0,121,1.5,NaN])assert.throws(()=>recurrenceMonths('custom',bad));
});
test('month-end renewals clamp without date overflow and leap year is respected',()=>{
  assert.equal(renewalNextDue('2026-01-31','monthly').toISOString().slice(0,10),'2026-02-28');
  assert.equal(renewalNextDue('2028-01-31','monthly').toISOString().slice(0,10),'2028-02-29');
  assert.equal(renewalNextDue('2026-11-30','quarterly').toISOString().slice(0,10),'2027-02-28');
});
test('invalid dates rejected (no JS Date normalization for February 30)',()=>{
  assert.throws(()=>utcDate('2026-02-30'));
  assert.throws(()=>utcDate('2026-05-10T00:00:00Z'));
  assert.throws(()=>utcDate('abc'));
});
test('reminder classifications are calendar-date inclusive and overdue stays overdue',()=>{
  const now=new Date('2026-11-23T17:00:00.000Z');
  assert.deepEqual(DEFAULT_REMINDER_DAYS,[30,15,7,3,1]);
  assert.deepEqual(renewalState('2026-11-30',now),{daysUntil:7,alert:'due-soon'});
  assert.deepEqual(renewalState('2026-12-24',now),{daysUntil:31,alert:'upcoming'});
  assert.deepEqual(renewalState('2026-11-22',now),{daysUntil:-1,alert:'overdue'});
  assert.deepEqual(renewalState('2026-11-23',now),{daysUntil:0,alert:'due-soon'});
  assert.equal(renewalState('2026-11-30',now,[3,1]).alert,'upcoming');
});
test('renewal payment enforces currency-safe 2-digit positive decimals',()=>{
  assert.equal(positiveAmount('500.00').toFixed(2),'500.00');
  assert.throws(()=>positiveAmount('500.001'));
  assert.throws(()=>positiveAmount('-1'));
});
test('finance permission is company-specific and team read cannot modify',()=>{
  assert.equal(roleAllows('team',['finance:read'],'finance','write'),false);
  assert.equal(roleAllows('team',['finance:write'],'finance','write'),true);
  assert.equal(roleAllows('owner',[],'finance','write'),true);
  assert.equal(roleAllows(undefined,[],'finance','read'),false);
});

test('settlement journal clears Accounts Payable without creating a second expense',async()=>{
  const {makeJournal,verifyJournal}=await import('../lib/finance.js');
  const lines=makeJournal('1500.00','Accounts Payable','Bank');
  assert.equal(lines[0].debit,'1500.00');
  assert.equal(lines[0].account,'Accounts Payable');
  assert.equal(lines[1].credit,'1500.00');
  assert.equal(verifyJournal(lines),true);
});
test('tenant context is mandatory and cannot bleed between asynchronous scopes',async()=>{
  const {currentTenant,runWithTenant}=await import('../saas/tenant-context.js');
  assert.throws(()=>currentTenant(),/Tenant context missing/);
  const first='507f1f77bcf86cd799439011',second='507f1f77bcf86cd799439012';
  const ids=await Promise.all([runWithTenant(first,async()=>{await Promise.resolve();return currentTenant();}),runWithTenant(second,async()=>{await Promise.resolve();return currentTenant();})]);
  assert.deepEqual(ids,[first,second]);
  assert.throws(()=>currentTenant());
});

test('monthly renewal retains last-day anchor even across February',()=>{
  const first=utcDate('2026-01-31'),anchor=recurrenceAnchor(first);
  assert.equal(anchor.monthEnd,true);
  const feb=renewalNextDue(first,'monthly',undefined,anchor);
  const mar=renewalNextDue(feb,'monthly',undefined,anchor);
  assert.equal(feb.toISOString().slice(0,10),'2026-02-28');
  assert.equal(mar.toISOString().slice(0,10),'2026-03-31');
  const annual=renewalNextDue('2028-02-29','yearly',undefined,recurrenceAnchor(utcDate('2028-02-29')));
  assert.equal(annual.toISOString().slice(0,10),'2029-02-28');
});
