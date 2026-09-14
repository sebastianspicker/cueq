/** Computes presentation-safe reporting totals without I/O or authorization decisions. */
import { ClosingStatus } from '@cueq/database';

export function databaseNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

export function overtimeTotalsFromAggregate(
  aggregate: { totalBalanceHours: unknown; totalOvertimeHours: unknown },
  population: number,
  suppressed: boolean,
) {
  const totalBalanceHours = suppressed
    ? 0
    : Number(databaseNumber(aggregate.totalBalanceHours).toFixed(2));
  const totalOvertimeHours = suppressed
    ? 0
    : Number(databaseNumber(aggregate.totalOvertimeHours).toFixed(2));

  return {
    people: suppressed ? 0 : population,
    totalBalanceHours,
    totalOvertimeHours,
    avgBalanceHours:
      suppressed || population === 0 ? 0 : Number((totalBalanceHours / population).toFixed(2)),
  };
}

export function closingCompletionTotalsFromGroups(
  groups: Array<{ status: ClosingStatus; count: unknown }>,
) {
  const counts = new Map(groups.map((group) => [group.status, databaseNumber(group.count)]));
  const exported = counts.get(ClosingStatus.EXPORTED) ?? 0;
  const closed = counts.get(ClosingStatus.CLOSED) ?? 0;
  const review = counts.get(ClosingStatus.REVIEW) ?? 0;
  const open = counts.get(ClosingStatus.OPEN) ?? 0;
  const periods = exported + closed + review + open;

  return {
    periods,
    exported,
    closed,
    review,
    open,
    completionRate: periods === 0 ? 0 : Number((exported / periods).toFixed(4)),
  };
}
