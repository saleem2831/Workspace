/** Client-side presentation filters only; server permissions and finance data are authoritative. */
export type RenewalMetric = 'all' | 'active' | 'due7' | 'due8to30' | 'overdue';
export type RenewalStatusFilter = 'all' | 'active' | 'due-soon' | 'overdue' | 'paused' | 'cancelled';
export type RenewalSort = 'due-asc' | 'due-desc' | 'amount-desc' | 'amount-asc' | 'name' | 'newest';
export type RenewalFilters = {
  search: string;
  status: RenewalStatusFilter;
  frequency: string;
  metric: RenewalMetric;
  sort: RenewalSort;
};
export type RenewalListRow = {
  title: string;
  description?: string;
  vendorName?: string;
  category: string;
  frequency: string;
  status: string;
  alert: string;
  daysUntil: number | null;
  nextDueAt: string;
  createdAt?: string;
  amount: any;
};

export function due8To30Count(summary?: { due7: number; due30: number }): number {
  // API due30 count is cumulative (0–30 days): remove 0–7 to prevent overlapping cards.
  return summary ? Math.max(0, summary.due30 - summary.due7) : 0;
}

function amountValue(row: RenewalListRow): number {
  const amount = row.amount?.$numberDecimal ?? row.amount;
  const value = Number(amount);
  return Number.isFinite(value) ? value : 0;
}

export function filterRenewals<T extends RenewalListRow>(rows: readonly T[], filters: RenewalFilters): T[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => {
    const days = row.daysUntil;
    const active = row.status === 'active';
    const metricMatches = filters.metric === 'all' ||
      (filters.metric === 'active' && active) ||
      (active && days !== null && (
        (filters.metric === 'due7' && days >= 0 && days <= 7) ||
        (filters.metric === 'due8to30' && days >= 8 && days <= 30) ||
        (filters.metric === 'overdue' && days < 0)
      ));
    const statusMatches = filters.status === 'all' ||
      (filters.status === 'due-soon' && active && row.alert === 'due-soon') ||
      (filters.status === 'overdue' && active && row.alert === 'overdue') ||
      row.status === filters.status;
    const frequencyMatches = filters.frequency === 'all' || row.frequency === filters.frequency;
    const searchMatches = !search ||
      `${row.title} ${row.vendorName || ''} ${row.category} ${row.description || ''}`.toLocaleLowerCase().includes(search);
    return metricMatches && statusMatches && frequencyMatches && searchMatches;
  });
  return filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'due-desc': return b.nextDueAt.localeCompare(a.nextDueAt);
      case 'amount-desc': return amountValue(b) - amountValue(a);
      case 'amount-asc': return amountValue(a) - amountValue(b);
      case 'name': return a.title.localeCompare(b.title);
      case 'newest': return (b.createdAt || '').localeCompare(a.createdAt || '');
      default: return a.nextDueAt.localeCompare(b.nextDueAt);
    }
  });
}
