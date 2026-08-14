import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import type { LeaveRule } from '@cueq/policy';
import { parseDateOrDateTime } from '@cueq/shared';
import { roundToTwo } from '../utils.js';
import { adjustmentDaysForYear, sumUsageDays } from './leave-adjustment.js';
import { allocateCarryOverUsage } from './leave-allocation.js';
import { deadlineForYear, usageEntriesForLedger } from './leave-date.js';
import { calculateEntitlementDays, cappedCarryOverDays } from './leave-entitlement.js';
import type { LeaveLedgerInput, LeaveLedgerResult } from './leave-ledger.types.js';

/** Compute entitlement, carry-over, usage, forfeiture, and adjustments for one leave year. */
export function calculateLeaveLedger(
  input: LeaveLedgerInput,
  rule: LeaveRule = DEFAULT_LEAVE_RULE,
): LeaveLedgerResult {
  const asOf = parseDateOrDateTime(input.asOfDate);
  const usage = usageEntriesForLedger(input.annualLeaveUsage, input.year, asOf);
  const entitlementDays = calculateEntitlementDays(input, rule);
  const carriedOverDays = cappedCarryOverDays(input, rule);
  const adjustmentsDays = adjustmentDaysForYear(input);
  const deadline = deadlineForYear(input.year, rule.carryOver.forfeitureDeadline);
  const { carriedOverUsedDays, carriedOverRemainingDays, forfeitedDays } = allocateCarryOverUsage({
    usage,
    asOf,
    deadline,
    carriedOverDays,
    carryOverEnabled: rule.carryOver.enabled,
  });
  const usedDays = sumUsageDays(usage);
  const currentYearUsedDays = roundToTwo(Math.max(usedDays - carriedOverUsedDays, 0));
  const remainingDays = roundToTwo(
    entitlementDays + carriedOverDays + adjustmentsDays - forfeitedDays - usedDays,
  );

  return {
    entitlementDays,
    carriedOverDays,
    forfeitedDays,
    usedDays,
    carriedOverUsedDays,
    carriedOverRemainingDays,
    currentYearUsedDays,
    adjustmentsDays,
    remainingDays,
  };
}
