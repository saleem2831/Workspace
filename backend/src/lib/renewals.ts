import { addCalendarMonths } from './dates.js';
import { HttpError } from './security.js';

export const DEFAULT_REMINDER_DAYS = [30, 15, 7, 3, 1] as const;
export type RenewalFrequency = 'monthly'|'quarterly'|'half-yearly'|'yearly'|'custom';
export function recurrenceMonths(frequency: RenewalFrequency, customMonths?: number): number {
    const values: Record<Exclude<RenewalFrequency,'custom'>,number> = {monthly:1,quarterly:3,'half-yearly':6,yearly:12};
    if (frequency === 'custom') {
        if (!Number.isInteger(customMonths) || !customMonths || customMonths < 1 || customMonths > 120)
            throw new HttpError(400,'Custom recurrence must be between 1 and 120 months');
        return customMonths;
    }
    if (!(frequency in values)) throw new HttpError(400,'Invalid recurrence');
    return values[frequency];
}
export function utcDate(value: string | Date): Date {
    if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new HttpError(400,'Date must use YYYY-MM-DD');
    const day = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : value;
    if (!Number.isFinite(day.getTime()) || (typeof value === 'string' && day.toISOString().slice(0,10) !== value))
        throw new HttpError(400,'Invalid renewal date');
    return day;
}
export function renewalNextDue(dueAt: string | Date, frequency: RenewalFrequency, customMonths?:number,
    anchor?:{day:number;monthEnd:boolean}): Date {
    const target=addCalendarMonths(dueAt,recurrenceMonths(frequency,customMonths));
    if(anchor){
        if(!Number.isInteger(anchor.day)||anchor.day<1||anchor.day>31)throw new HttpError(400,'Invalid recurrence anchor day');
        const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
        target.setUTCDate(anchor.monthEnd?last:Math.min(anchor.day,last));
    }
    return target;
}
export function recurrenceAnchor(date:Date){
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    return {day:date.getUTCDate(),monthEnd:date.getUTCDate()===last};
}

export function renewalState(dueAt: string | Date, now: Date = new Date(), reminderDays: number[] = [...DEFAULT_REMINDER_DAYS]) {
    // Calendar dates are compared at UTC midnight to prevent timezone boundary alerts.
    const target=utcDate(dueAt);
    const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    const daysUntil=Math.round((target.getTime()-today)/86400000);
    const triggers=[...new Set(reminderDays)].filter(x=>Number.isInteger(x)&&x>=0&&x<=365).sort((a,b)=>b-a);
    return { daysUntil, alert:daysUntil<0?'overdue':triggers.some(x=>daysUntil<=x)?'due-soon':'upcoming' } as const;
}
