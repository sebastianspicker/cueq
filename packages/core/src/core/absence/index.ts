import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import type { LeaveRule } from '@cueq/policy';
import type { CoreProratedTargetContract } from '@cueq/shared';
import { roundToTwo } from '../utils';

export interface WorkSegment {
  from: string;
  to: string;
  weeklyHours: number;
}

export type ProratedTargetInput = CoreProratedTargetContract['input'] & {
  personCode?: string;
  segments: WorkSegment[];
  holidayDates?: string[];
};

export type ProratedTargetResult = CoreProratedTargetContract['output'] & {
  violations: Array<{ code: string; message: string }>;
};

function parseDate(dateValue: string): Date {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateValue}`);
  }
  return date;
}

function parseIsoDateTimeOrDate(dateValue: string): Date {
  const date = dateValue.includes('T')
    ? new Date(dateValue)
    : new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateValue}`);
  }
  return date;
}

function countWeekdaysInclusive(from: string, to: string, holidayDates: Set<string>): number {
  const start = parseDate(from);
  const end = parseDate(to);
  let weekdays = 0;

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    const isoDate = date.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidayDates.has(isoDate)) {
      weekdays += 1;
    }
  }

  return weekdays;
}

export interface AbsenceWorkingDaysInput {
  startDate: string;
  endDate: string;
  holidayDates?: string[];
}

export function calculateAbsenceWorkingDays(input: AbsenceWorkingDaysInput): number {
  const holidays = new Set(input.holidayDates ?? []);
  return countWeekdaysInclusive(input.startDate, input.endDate, holidays);
}

export function calculateProratedMonthlyTarget(input: ProratedTargetInput): ProratedTargetResult {
  const violations: Array<{ code: string; message: string }> = [];
  const holidayDates = new Set(input.holidayDates ?? []);

  const segmentTarget = input.segments.reduce((sum, segment) => {
    if (segment.weeklyHours < 0) {
      violations.push({
        code: 'NEGATIVE_WEEKLY_HOURS',
        message: `Segment ${segment.from} - ${segment.to} has negative weekly hours.`,
      });
      return sum;
    }

    const weekdays = countWeekdaysInclusive(segment.from, segment.to, holidayDates);
    const dailyHours = segment.weeklyHours / 5;
    return sum + weekdays * dailyHours;
  }, 0);

  const transitionAdjustmentHours = input.transitionAdjustmentHours ?? 0;
  const proratedTargetHours = roundToTwo(segmentTarget + transitionAdjustmentHours);

  return {
    proratedTargetHours,
    deltaHours: roundToTwo(input.actualHours - proratedTargetHours),
    violations,
  };
}

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

function monthOf(dateIso: string): number {
  return parseDate(dateIso).getUTCMonth() + 1;
}

function proRataFactor(entryDate?: string, exitDate?: string): number {
  const startMonth = entryDate ? monthOf(entryDate) : 1;
  const endMonth = exitDate ? monthOf(exitDate) : 12;
  const coveredMonths = Math.max(endMonth - startMonth + 1, 0);
  return coveredMonths / 12;
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

function coveredMonthFactor(
  year: number,
  employmentStartDate?: string,
  employmentEndDate?: string,
): number {
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);
  const start = employmentStartDate ? parseIsoDateTimeOrDate(employmentStartDate) : yearStart;
  const end = employmentEndDate ? parseIsoDateTimeOrDate(employmentEndDate) : yearEnd;
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

export function calculateLeaveLedger(
  input: LeaveLedgerInput,
  rule: LeaveRule = DEFAULT_LEAVE_RULE,
): LeaveLedgerResult {
  const asOf = parseIsoDateTimeOrDate(input.asOfDate);
  const yearStart = startOfYear(input.year);
  const yearEnd = endOfYear(input.year);
  const usage = (input.annualLeaveUsage ?? [])
    .filter((entry) => {
      const when = parseIsoDateTimeOrDate(entry.date);
      return when >= yearStart && when <= yearEnd && when <= asOf;
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const fullTimeWeeklyHours = Number(rule.fullTimeWeeklyHours ?? 39.83);
  const employmentFraction = Math.max(input.workTimeModelWeeklyHours / fullTimeWeeklyHours, 0);
  const monthFactor = coveredMonthFactor(
    input.year,
    input.employmentStartDate,
    input.employmentEndDate,
  );
  const shouldProrate = rule.proRataOnEntry || rule.proRataOnExit;
  const entitlementDays = roundToTwo(
    rule.annualEntitlementDays * employmentFraction * (shouldProrate ? monthFactor : 1),
  );
  const carriedOverDays = roundToTwo(
    Math.min(Math.max(input.priorYearCarryOverDays ?? 0, 0), rule.carryOver.maxDays),
  );
  const adjustmentsDays = roundToTwo(
    (input.adjustments ?? [])
      .filter((entry) => entry.year === input.year)
      .reduce((sum, entry) => sum + entry.deltaDays, 0),
  );

  const deadline = deadlineForYear(input.year, rule.carryOver.forfeitureDeadline);
  let carryRemaining = carriedOverDays;
  let carriedOverUsedDays = 0;
  let forfeitedDays = 0;
  let deadlineApplied = false;

  for (const entry of usage) {
    const entryDate = parseIsoDateTimeOrDate(entry.date);
    if (rule.carryOver.enabled && !deadlineApplied && entryDate > deadline) {
      forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
      carryRemaining = 0;
      deadlineApplied = true;
    }

    const fromCarry = Math.min(carryRemaining, entry.days);
    carryRemaining = roundToTwo(carryRemaining - fromCarry);
    carriedOverUsedDays = roundToTwo(carriedOverUsedDays + fromCarry);
  }

  if (rule.carryOver.enabled && !deadlineApplied && asOf > deadline) {
    forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
    carryRemaining = 0;
  }

  const usedDays = roundToTwo(usage.reduce((sum, entry) => sum + entry.days, 0));
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
    carriedOverRemainingDays: carryRemaining,
    currentYearUsedDays,
    adjustmentsDays,
    remainingDays,
  };
}

export function calculateLeaveQuota(
  input: LeaveQuotaInput,
  rule: LeaveRule = DEFAULT_LEAVE_RULE,
): LeaveQuotaResult {
  const yearlyBase = rule.annualEntitlementDays * input.employmentFraction;
  const prorated =
    (input.entryDate && rule.proRataOnEntry) || (input.exitDate && rule.proRataOnExit)
      ? yearlyBase * proRataFactor(input.entryDate, input.exitDate)
      : yearlyBase;

  const entitlementDays = roundToTwo(prorated);
  const carriedOverDays = Math.min(input.carryOverDays ?? 0, rule.carryOver.maxDays);

  const { month, day } = parseMonthDay(input.asOfDate);
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
