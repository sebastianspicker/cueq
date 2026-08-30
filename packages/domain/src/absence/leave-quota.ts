import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import type { LeaveRule } from '@cueq/policy';
import { roundToTwo } from '../numerical/precision.js';
import { coveredMonthFactor, parseMonthDay } from './leave-date.js';
import type { LeaveQuotaInput, LeaveQuotaResult } from './leave-ledger.types.js';

/** Calculate the simplified leave quota for one year. */
export function calculateLeaveQuota(
  input: LeaveQuotaInput,
  rule: LeaveRule = DEFAULT_LEAVE_RULE,
): LeaveQuotaResult {
  const yearlyBase = rule.annualEntitlementDays * input.employmentFraction;
  const prorated =
    (input.entryDate && rule.proRataOnEntry) || (input.exitDate && rule.proRataOnExit)
      ? yearlyBase * coveredMonthFactor(input.year, input.entryDate, input.exitDate)
      : yearlyBase;

  const entitlementDays = roundToTwo(prorated);
  const carriedOverDays = Math.min(input.carryOverDays ?? 0, rule.carryOver.maxDays);
  const { month, day } = parseMonthDay(input.asOfDate.slice(0, 10));
  const { month: deadlineMonth, day: deadlineDay } = parseMonthDay(
    rule.carryOver.forfeitureDeadline,
  );
  const isAfterDeadline = month > deadlineMonth || (month === deadlineMonth && day > deadlineDay);
  const forfeitedDays = isAfterDeadline && rule.carryOver.enabled ? carriedOverDays : 0;
  const remainingDays = roundToTwo(
    entitlementDays + carriedOverDays - forfeitedDays - input.usedDays,
  );

  return { entitlementDays, carriedOverDays, forfeitedDays, remainingDays };
}
