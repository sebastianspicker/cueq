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
