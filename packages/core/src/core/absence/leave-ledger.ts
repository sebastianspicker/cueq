import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import type { LeaveRule } from '@cueq/policy';
import { parseDateOrDateTime } from '@cueq/shared';
import { roundToTwo } from '../utils';

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

function parseMonthDay(value: string): { month: number; day: number } {
  const parts = value.split('-').map((part) => Number(part));
  const month = parts[parts.length - 2];
  const day = parts[parts.length - 1];

  if (!month || !day) {
    throw new Error(`Invalid month-day value: ${value}`);
  }

  return { month, day };
}

function startOfYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
}

function endOfYear(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function deadlineForYear(year: number, monthDay: string): Date {
  const { month, day } = parseMonthDay(monthDay);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

// Note: Counts any month touched, which may slightly overestimate entitlement for very short employment spans.
function coveredMonthFactor(
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

  if (effectiveEnd < effectiveStart) {
    return 0;
  }

  const startMonth = effectiveStart.getUTCMonth() + 1;
  const endMonth = effectiveEnd.getUTCMonth() + 1;
  const coveredMonths = Math.max(endMonth - startMonth + 1, 0);
  return coveredMonths / 12;
}

function usageEntriesForLedger(
  usageEntries: LeaveUsageEntry[] | undefined,
  year: number,
  asOf: Date,
): LeaveUsageEntry[] {
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);

  return (usageEntries ?? [])
    .filter((entry) => {
      const when = parseDateOrDateTime(entry.date);
      return when >= yearStart && when <= yearEnd && when <= asOf;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function employmentFractionForWeeklyHours(weeklyHours: number, rule: LeaveRule): number {
  const fullTimeWeeklyHours = Number(rule.fullTimeWeeklyHours ?? 39.83);
  return Math.max(weeklyHours / fullTimeWeeklyHours, 0);
}

function calculateEntitlementDays(input: LeaveLedgerInput, rule: LeaveRule): number {
  const employmentFraction = employmentFractionForWeeklyHours(input.workTimeModelWeeklyHours, rule);
  const monthFactor = coveredMonthFactor(
    input.year,
    input.employmentStartDate,
    input.employmentEndDate,
  );
  const shouldProrate = rule.proRataOnEntry || rule.proRataOnExit;

  return roundToTwo(
    rule.annualEntitlementDays * employmentFraction * (shouldProrate ? monthFactor : 1),
  );
}

function cappedCarryOverDays(input: LeaveLedgerInput, rule: LeaveRule): number {
  return roundToTwo(
    Math.min(Math.max(input.priorYearCarryOverDays ?? 0, 0), rule.carryOver.maxDays),
  );
}

function adjustmentDaysForYear(input: LeaveLedgerInput): number {
  return roundToTwo(
    (input.adjustments ?? [])
      .filter((entry) => entry.year === input.year)
      .reduce((sum, entry) => sum + entry.deltaDays, 0),
  );
}

function sumUsageDays(usage: LeaveUsageEntry[]): number {
  return roundToTwo(usage.reduce((sum, entry) => sum + entry.days, 0));
}

function allocateCarryOverUsage(input: {
  usage: LeaveUsageEntry[];
  asOf: Date;
  deadline: Date;
  carriedOverDays: number;
  carryOverEnabled: boolean;
}): {
  carriedOverUsedDays: number;
  carriedOverRemainingDays: number;
  forfeitedDays: number;
} {
  let carryRemaining = input.carriedOverDays;
  let carriedOverUsedDays = 0;
  let forfeitedDays = 0;
  let deadlineApplied = false;

  for (const entry of input.usage) {
    const entryDate = parseDateOrDateTime(entry.date);
    if (input.carryOverEnabled && !deadlineApplied && entryDate > input.deadline) {
      forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
      carryRemaining = 0;
      deadlineApplied = true;
    }

    const fromCarry = Math.min(carryRemaining, entry.days);
    carryRemaining = roundToTwo(carryRemaining - fromCarry);
    carriedOverUsedDays = roundToTwo(carriedOverUsedDays + fromCarry);
  }

  if (input.carryOverEnabled && !deadlineApplied && input.asOf > input.deadline) {
    forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
    carryRemaining = 0;
  }

  return {
    carriedOverUsedDays,
    carriedOverRemainingDays: carryRemaining,
    forfeitedDays,
  };
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
