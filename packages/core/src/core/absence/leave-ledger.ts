/** Reconciles entitlement, carry-over, usage, forfeiture, and HR adjustments into one balance. */
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import type { LeaveRule } from '@cueq/policy';
import { parseDateOrDateTime } from '@cueq/shared';
import { roundToTwo } from '../utils.js';
import { adjustmentDaysForYear, sumUsageDays } from './leave-adjustment.js';
import { allocateCarryOverUsage } from './leave-allocation.js';
import {
  deadlineForYear,
  coveredMonthFactor,
  parseMonthDay,
  usageEntriesForLedger,
} from './leave-date.js';
import { calculateEntitlementDays, cappedCarryOverDays } from './leave-entitlement.js';

export interface LeaveQuotaInput {
  year: number;
  employmentFraction: number;
  entryDate?: string;
  exitDate?: string;
  usedDays: number;
  carryOverDays?: number;
  asOfDate: string;
}

export interface LeaveQuotaResult {
  entitlementDays: number;
  carriedOverDays: number;
  forfeitedDays: number;
  remainingDays: number;
}

export interface LeaveUsageEntry {
  date: string;
  days: number;
}

export interface LeaveAdjustmentEntry {
  year: number;
  deltaDays: number;
}

export interface LeaveLedgerInput {
  year: number;
  asOfDate: string;
  workTimeModelWeeklyHours: number;
  employmentStartDate?: string;
  employmentEndDate?: string;
  priorYearCarryOverDays?: number;
  annualLeaveUsage?: LeaveUsageEntry[];
  adjustments?: LeaveAdjustmentEntry[];
}

export interface LeaveLedgerResult extends LeaveQuotaResult {
  usedDays: number;
  carriedOverUsedDays: number;
  carriedOverRemainingDays: number;
  adjustmentsDays: number;
  currentYearUsedDays: number;
}

function proRataFactor(year: number, entryDate?: string, exitDate?: string): number {
  return coveredMonthFactor(year, entryDate, exitDate);
}

/**
 * Compute a full leave ledger for a given year according to TV-L rules.
 *
 * Calculates annual entitlement (pro-rated by employment fraction and covered
 * months), carry-over from the prior year (capped by rule), forfeiture after
 * the carry-over deadline, and breaks down usage into carried-over vs.
 * current-year consumption. Adjustments (manual corrections) are included.
 */
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

/**
 * Calculate leave entitlement quota for a year (simplified variant).
 *
 * Applies employment fraction, optional pro-rata for entry/exit months,
 * carry-over cap, and deadline-based forfeiture. Returns entitlement,
 * carried-over days, forfeited days, and remaining balance.
 */
export function calculateLeaveQuota(
  input: LeaveQuotaInput,
  rule: LeaveRule = DEFAULT_LEAVE_RULE,
): LeaveQuotaResult {
  const yearlyBase = rule.annualEntitlementDays * input.employmentFraction;
  const prorated =
    (input.entryDate && rule.proRataOnEntry) || (input.exitDate && rule.proRataOnExit)
      ? yearlyBase * proRataFactor(input.year, input.entryDate, input.exitDate)
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

  return {
    entitlementDays,
    carriedOverDays,
    forfeitedDays,
    remainingDays,
  };
}
