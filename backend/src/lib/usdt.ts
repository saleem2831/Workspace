import { D } from './finance.js';
import { HttpError } from './security.js';
/** Match a sale against a specified open buy lot. Values are INR and USDT, not floating point. */
export function calculateUsdtSale(quantity: string | number, buyRate: string | number, sellRate: string | number) {
  let qty, buy, sell;
  try { qty = D(quantity); buy = D(buyRate); sell = D(sellRate); }
  catch { throw new HttpError(400,'Invalid USDT values'); }
  if (![qty,buy,sell].every(x=>x.isFinite() && x.gt(0))) throw new HttpError(400,'Quantity and rates must be positive');
  return { proceeds: qty.times(sell).toFixed(2), costBasis: qty.times(buy).toFixed(2), realizedPnl: qty.times(sell.minus(buy)).toFixed(2) };
}
