import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateUsdtSale } from '../lib/usdt.js';
test('5000 USDT bought at INR 100 and sold at INR 101 yields INR 5000 profit',()=> {
  assert.deepEqual(calculateUsdtSale(5000,100,101),{ proceeds:'505000.00',costBasis:'500000.00',realizedPnl:'5000.00' });
});
test('supports fractional quantities without floating point errors',()=> {
  assert.equal(calculateUsdtSale('0.1','99.10','100.20').realizedPnl, '0.11');
});
test('rejects invalid values',()=> {
  assert.throws(()=>calculateUsdtSale(-1,100,101));
});
