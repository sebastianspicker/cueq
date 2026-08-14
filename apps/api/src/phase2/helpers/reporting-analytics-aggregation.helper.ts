/** Computes presentation-safe reporting totals without I/O or authorization decisions. */
import { ClosingStatus } from '@cueq/database';

export function absenceTotals(absences: Array<{ days: unknown }>) {
  return {
    requests: absences.length,
    days: Number(absences.reduce((sum, absence) => sum + Number(absence.days), 0).toFixed(2)),
  };
}

export function absenceTypeBuckets(absences: Array<{ type: string; days: unknown }>) {
  const byType = new Map<string, { requests: number; days: number }>();
  for (const absence of absences) {
    const current = byType.get(absence.type) ?? { requests: 0, days: 0 };
    current.requests += 1;
    current.days += Number(absence.days);
    byType.set(absence.type, current);
  }

  return [...byType.entries()].map(([type, value]) => ({
    type,
    requests: value.requests,
    days: Number(value.days.toFixed(2)),
  }));
}

export function overtimeTotals(
  accounts: Array<{ balance: unknown; overtimeHours: unknown }>,
  population: number,
  suppressed: boolean,
) {
  const totalBalanceHours = suppressed
    ? 0
    : Number(accounts.reduce((sum, account) => sum + Number(account.balance), 0).toFixed(2));
  const totalOvertimeHours = suppressed
    ? 0
    : Number(accounts.reduce((sum, account) => sum + Number(account.overtimeHours), 0).toFixed(2));

  return {
    people: suppressed ? 0 : population,
    totalBalanceHours,
    totalOvertimeHours,
    avgBalanceHours:
      suppressed || population === 0 ? 0 : Number((totalBalanceHours / population).toFixed(2)),
  };
}

export function closingCompletionTotals(periods: Array<{ status: ClosingStatus }>) {
  const exported = periods.filter((period) => period.status === ClosingStatus.EXPORTED).length;

  return {
    periods: periods.length,
    exported,
    closed: periods.filter((period) => period.status === ClosingStatus.CLOSED).length,
    review: periods.filter((period) => period.status === ClosingStatus.REVIEW).length,
    open: periods.filter((period) => period.status === ClosingStatus.OPEN).length,
    completionRate: periods.length === 0 ? 0 : Number((exported / periods.length).toFixed(4)),
  };
}
