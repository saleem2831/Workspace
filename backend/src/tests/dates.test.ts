import test from 'node:test';
import assert from 'node:assert/strict';
import {addCalendarMonths} from '../lib/dates.js';
test('subscription renewal handles February end-of-month',()=>{
 assert.equal(addCalendarMonths('2027-01-31T00:00:00Z',1).toISOString().slice(0,10),'2027-02-28');
 assert.equal(addCalendarMonths('2028-01-31T00:00:00Z',1).toISOString().slice(0,10),'2028-02-29');
 assert.equal(addCalendarMonths('2026-11-05T00:00:00Z',12).toISOString().slice(0,10),'2027-11-05');
});
