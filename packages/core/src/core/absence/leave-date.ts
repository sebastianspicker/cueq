import { parseDateOrDateTime } from '@cueq/shared';
import type { LeaveUsageEntry } from './leave-ledger';

export function parseMonthDay(value: string): { month: number; day: number } {
  const parts = value.split('-').map(Number);
  const month = parts.at(-2);
  const day = parts.at(-1);
  if (!month || !day) throw new Error(`Invalid month-day value: ${value}`);
  return { month, day };
}

export function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

export function endOfYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

export function deadlineForYear(year: number, monthDay: string): Date {
  const { month, day } = parseMonthDay(monthDay);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

export function coveredMonthFactor(
  year: number,
  employmentStartDate?: string,
  employmentEndDate?: string,
): number {
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);
  const start = employmentStartDate ? parseDateOrDateTime(employmentStartDate) : yearStart;
  const end = employmentEndDate ? parseDateOrDateTime(employmentEndDate) : yearEnd;
  const effectiveStart = start > yearStart ? start : yearStart;
  const effectiveEnd = end < yearEnd ? end : yearEnd;
  if (effectiveEnd < effectiveStart) return 0;
  return (effectiveEnd.getUTCMonth() - effectiveStart.getUTCMonth() + 1) / 12;
}

export function usageEntriesForLedger(
  entries: LeaveUsageEntry[] | undefined,
  year: number,
  asOf: Date,
): LeaveUsageEntry[] {
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);
  return (entries ?? [])
    .filter((entry) => {
      const when = parseDateOrDateTime(entry.date);
      return when >= yearStart && when <= yearEnd && when <= asOf;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}
