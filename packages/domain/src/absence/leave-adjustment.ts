/** Aggregates explicit HR adjustments and recorded leave usage for one ledger year. */
import { roundToTwo } from '../numerical/precision.js';
import type { LeaveLedgerInput, LeaveUsageEntry } from './leave-ledger.types.js';

/** Sum only the explicit HR adjustments that belong to the requested ledger year. */
export function adjustmentDaysForYear(input: LeaveLedgerInput): number {
  return roundToTwo(
    (input.adjustments ?? [])
      .filter((entry) => entry.year === input.year)
      .reduce((sum, entry) => sum + entry.deltaDays, 0),
  );
}

/** Sum normalized leave usage without exposing floating-point accumulation noise. */
export function sumUsageDays(usage: LeaveUsageEntry[]): number {
  return roundToTwo(usage.reduce((sum, entry) => sum + entry.days, 0));
}
