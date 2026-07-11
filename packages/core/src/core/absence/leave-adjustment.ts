import { roundToTwo } from '../utils';
import type { LeaveLedgerInput, LeaveUsageEntry } from './leave-ledger';

export function adjustmentDaysForYear(input: LeaveLedgerInput): number {
  return roundToTwo(
    (input.adjustments ?? [])
      .filter((entry) => entry.year === input.year)
      .reduce((sum, entry) => sum + entry.deltaDays, 0),
  );
}

export function sumUsageDays(usage: LeaveUsageEntry[]): number {
  return roundToTwo(usage.reduce((sum, entry) => sum + entry.days, 0));
}
