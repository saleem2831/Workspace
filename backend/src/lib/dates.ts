/** Calendar-month subscription renewal: clamp to last day when target month is shorter. */
export function addCalendarMonths(isoDate: string | Date, months: number): Date {
 const start = new Date(isoDate);
 if (Number.isNaN(start.getTime()) || !Number.isInteger(months) || months < 1 || months > 120)
  throw new Error('Invalid subscription date or duration');
 const y = start.getUTCFullYear();
 const m = start.getUTCMonth() + months;
 const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
 const target = new Date(start.getTime());
 target.setUTCDate(1);
 target.setUTCFullYear(y, m, Math.min(start.getUTCDate(), last));
 return target;
}
