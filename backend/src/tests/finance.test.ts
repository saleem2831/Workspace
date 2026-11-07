import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D, makeJournal, positiveAmount, nonNegativeAmount, verifyJournal } from '../lib/finance.js';
test('decimal totals do not accumulate floating point errors', () => { assert.equal(D('0.1').plus(D('0.2')).toFixed(2), '0.30'); });
test('journal balances', () => { assert.equal(verifyJournal(makeJournal('1500.00', 'Accounts Receivable', 'Revenue')), true); });
test('negative and excess precision rejected', () => { assert.throws(() => positiveAmount('-10')); assert.throws(() => positiveAmount('1.001')); });
test('unbalanced journal rejected', () => { assert.throws(() => verifyJournal([{ account: 'Expense', debit: '10', credit: '0' }, { account: 'Cash', debit: '0', credit: '9' }])); });
test('zero is allowed for nonnegative budget but not for required payment', () => { assert.equal(nonNegativeAmount('0.00').toFixed(2), '0.00'); assert.throws(() => positiveAmount('0')); });
test('invalid money is rejected', () => {
    for (const v of ['abc', 'NaN', 'Infinity'])
        assert.throws(() => nonNegativeAmount(v));
});
