import type { LeaveRule } from '@cueq/policy';
import { roundToTwo } from '../utils';
import type { LeaveLedgerInput } from './leave-ledger';
import { coveredMonthFactor } from './leave-date';

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

export function cappedCarryOverDays(input: LeaveLedgerInput, rule: LeaveRule): number {
  return roundToTwo(
    Math.min(Math.max(input.priorYearCarryOverDays ?? 0, 0), rule.carryOver.maxDays),
  );
}
