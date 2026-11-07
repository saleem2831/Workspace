import { Decimal } from 'decimal.js';
import { HttpError } from './security.js';
export const D = (value: unknown) => new Decimal(String(value ?? 0));
export function nonNegativeAmount(value: unknown) {
    let amount: Decimal;
    try {
        amount = D(value);
    }
    catch {
        throw new HttpError(400, 'Amount must be a valid decimal number');
    }
    if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2) {
        throw new HttpError(400, 'Amount must be nonnegative with at most two decimal places');
    }
    return amount;
}
export function positiveAmount(value: unknown) {
    const amount = nonNegativeAmount(value);
    if (amount.lte(0))
        throw new HttpError(400, 'Amount must be greater than zero');
    return amount;
}
export function verifyJournal(lines: Array<{
    account: string;
    debit: string;
    credit: string;
}>) {
    if (lines.length < 2)
        throw new HttpError(400, 'Journal requires at least 2 lines');
    const debit = lines.reduce((a, line) => a.plus(D(line.debit)), D(0));
    const credit = lines.reduce((a, line) => a.plus(D(line.credit)), D(0));
    if (lines.some(l => D(l.debit).lt(0) || D(l.credit).lt(0) || (D(l.debit).gt(0) && D(l.credit).gt(0))) || !debit.eq(credit) || debit.lte(0))
        throw new HttpError(400, 'Unbalanced journal');
    return true;
}
export function makeJournal(amount: string, debitAccount: string, creditAccount: string) {
    positiveAmount(amount);
    const lines = [{ account: debitAccount, debit: amount, credit: '0' }, { account: creditAccount, debit: '0', credit: amount }];
    verifyJournal(lines);
    return lines;
}
