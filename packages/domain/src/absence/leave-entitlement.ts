/** Applies effective leave rules to annual entitlement and carry-over limits. */
import type { LeaveRule } from '@cueq/policy';
import { roundToTwo } from '../numerical/precision.js';
import type { LeaveLedgerInput } from './leave-ledger.types.js';
import { coveredMonthFactor } from './leave-date.js';

/** Scale annual entitlement by work-time fraction and rule-controlled entry/exit prorating. */
export function calculateEntitlementDays(input: LeaveLedgerInput, rule: LeaveRule): number {
  const fullTimeWeeklyHours = Number(rule.fullTimeWeeklyHours ?? 39.83);
  const employmentFraction = Math.max(input.workTimeModelWeeklyHours / fullTimeWeeklyHours, 0);
  const monthFactor = coveredMonthFactor(
    input.year,
    input.employmentStartDate,
    input.employmentEndDate,
  );
  return roundToTwo(
    rule.annualEntitlementDays *
      employmentFraction *
      (rule.proRataOnEntry || rule.proRataOnExit ? monthFactor : 1),
  );
}

/** Clamp prior-year carry-over to non-negative input and the active policy maximum. */
export function cappedCarryOverDays(input: LeaveLedgerInput, rule: LeaveRule): number {
  return roundToTwo(
    Math.min(Math.max(input.priorYearCarryOverDays ?? 0, 0), rule.carryOver.maxDays),
  );
}
