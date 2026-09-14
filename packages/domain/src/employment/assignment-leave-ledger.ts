import type { LeaveRule } from '@cueq/policy';
import { calculateLeaveLedger } from '../absence/leave-ledger-calculation.js';
import type { LeaveLedgerInput, LeaveLedgerResult } from '../absence/leave-ledger.types.js';
import { parseDateOnly, parseDateOrDateTime } from '../calendar/date-parsing.js';
import { roundToTwo } from '../numerical/precision.js';

const DAY_MILLISECONDS = 86_400_000;

export interface AssignmentLeaveSegment {
  from: string;
  to: string;
  weeklyHours: number;
  workingDays: number[];
  rule: LeaveRule;
}

export interface AssignmentLeaveCalculationPolicy {
  proration: 'CALENDAR_DAYS';
  partTimeBasis: 'WEEKLY_HOURS' | 'WORKING_DAYS';
  rounding: 'TWO_DECIMALS_AT_TOTAL';
  carryOverPolicyAt: 'YEAR_START' | 'YEAR_END' | 'AS_OF';
}

export interface AssignmentLeaveLedgerInput extends LeaveLedgerInput {
  segments: AssignmentLeaveSegment[];
  calculationPolicy?: AssignmentLeaveCalculationPolicy;
}

export type AssignmentLeaveLedgerErrorCode =
  | 'CALCULATION_POLICY_REQUIRED'
  | 'INVALID_CALCULATION_POLICY'
  | 'INVALID_SEGMENT_COVERAGE';

/** Typed configuration failure for callers that map domain errors to API responses. */
export class AssignmentLeaveLedgerError extends Error {
  readonly code: AssignmentLeaveLedgerErrorCode;

  constructor(code: AssignmentLeaveLedgerErrorCode, message: string) {
    super(message);
    this.name = 'AssignmentLeaveLedgerError';
    this.code = code;
  }
}

interface NormalizedSegment {
  segment: AssignmentLeaveSegment;
  from: number;
  to: number;
}

interface CoveredInterval {
  from: number;
  to: number;
}

function utcDateTimestamp(value: string): number {
  const date = parseDateOrDateTime(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function normalizedWorkingDays(days: number[]): number[] {
  for (const day of days) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new AssignmentLeaveLedgerError(
        'INVALID_SEGMENT_COVERAGE',
        'Segment working days must be ISO weekdays from 1 through 7.',
      );
    }
  }
  return [...new Set(days)].sort((left, right) => left - right);
}

function normalizeSegments(segments: AssignmentLeaveSegment[]): NormalizedSegment[] {
  return segments
    .map((segment) => {
      const from = parseDateOnly(segment.from).getTime();
      const to = parseDateOnly(segment.to).getTime();
      if (from > to || !Number.isFinite(segment.weeklyHours)) {
        throw new AssignmentLeaveLedgerError(
          'INVALID_SEGMENT_COVERAGE',
          'Leave segments require ordered dates and finite weekly hours.',
        );
      }
      normalizedWorkingDays(segment.workingDays);
      return { segment, from, to };
    })
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function coveredEmploymentInterval(input: LeaveLedgerInput): CoveredInterval | undefined {
  const yearFrom = Date.UTC(input.year, 0, 1);
  const yearTo = Date.UTC(input.year, 11, 31);
  const employmentFrom = input.employmentStartDate
    ? utcDateTimestamp(input.employmentStartDate)
    : yearFrom;
  const employmentTo = input.employmentEndDate ? utcDateTimestamp(input.employmentEndDate) : yearTo;
  const from = Math.max(yearFrom, employmentFrom);
  const to = Math.min(yearTo, employmentTo);
  return from <= to ? { from, to } : undefined;
}

function clipAndValidateCoverage(
  segments: NormalizedSegment[],
  covered: CoveredInterval,
): NormalizedSegment[] {
  const clipped = segments
    .map(({ segment, from, to }) => ({
      segment,
      from: Math.max(from, covered.from),
      to: Math.min(to, covered.to),
    }))
    .filter(({ from, to }) => from <= to);

  if (clipped[0]?.from !== covered.from || clipped.at(-1)?.to !== covered.to) {
    throw new AssignmentLeaveLedgerError(
      'INVALID_SEGMENT_COVERAGE',
      'Leave segments must cover the complete employment interval in the ledger year.',
    );
  }

  for (let index = 1; index < clipped.length; index += 1) {
    const previous = clipped[index - 1];
    const current = clipped[index];
    if (previous === undefined || current === undefined) continue;
    if (current.from <= previous.to) {
      throw new AssignmentLeaveLedgerError(
        'INVALID_SEGMENT_COVERAGE',
        'Leave segments must not overlap within the employment interval.',
      );
    }
    if (current.from !== previous.to + DAY_MILLISECONDS) {
      throw new AssignmentLeaveLedgerError(
        'INVALID_SEGMENT_COVERAGE',
        'Leave segments must not leave gaps within the employment interval.',
      );
    }
  }

  return clipped;
}

function sameNumberSet(left: number[], right: number[]): boolean {
  const normalizedLeft = normalizedWorkingDays(left);
  const normalizedRight = normalizedWorkingDays(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function sameLeaveRule(left: LeaveRule, right: LeaveRule): boolean {
  return (
    left.annualEntitlementDays === right.annualEntitlementDays &&
    left.fullTimeWeeklyHours === right.fullTimeWeeklyHours &&
    left.workDaysPerWeek === right.workDaysPerWeek &&
    left.proRataOnEntry === right.proRataOnEntry &&
    left.proRataOnExit === right.proRataOnExit &&
    left.carryOver.enabled === right.carryOver.enabled &&
    left.carryOver.maxDays === right.carryOver.maxDays &&
    left.carryOver.forfeitureDeadline === right.carryOver.forfeitureDeadline
  );
}

function sameBusinessConfiguration(
  left: AssignmentLeaveSegment,
  right: AssignmentLeaveSegment,
): boolean {
  return (
    left.weeklyHours === right.weeklyHours &&
    sameNumberSet(left.workingDays, right.workingDays) &&
    sameLeaveRule(left.rule, right.rule)
  );
}

function requireSupportedPolicy(
  policy: AssignmentLeaveCalculationPolicy | undefined,
): AssignmentLeaveCalculationPolicy {
  if (policy === undefined) {
    throw new AssignmentLeaveLedgerError(
      'CALCULATION_POLICY_REQUIRED',
      'A calculation policy is required when employment term configurations differ.',
    );
  }
  if (
    policy.proration !== 'CALENDAR_DAYS' ||
    !['WEEKLY_HOURS', 'WORKING_DAYS'].includes(policy.partTimeBasis) ||
    policy.rounding !== 'TWO_DECIMALS_AT_TOTAL' ||
    !['YEAR_START', 'YEAR_END', 'AS_OF'].includes(policy.carryOverPolicyAt)
  ) {
    throw new AssignmentLeaveLedgerError(
      'INVALID_CALCULATION_POLICY',
      'The assignment leave calculation policy is incomplete or unsupported.',
    );
  }
  return policy;
}

function coveredDays(segment: NormalizedSegment): number {
  return (segment.to - segment.from) / DAY_MILLISECONDS + 1;
}

function daysInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MILLISECONDS;
}

function partTimeRatio(
  segment: AssignmentLeaveSegment,
  basis: AssignmentLeaveCalculationPolicy['partTimeBasis'],
): number {
  if (basis === 'WEEKLY_HOURS') {
    return Math.max(segment.weeklyHours / segment.rule.fullTimeWeeklyHours, 0);
  }
  return Math.max(
    normalizedWorkingDays(segment.workingDays).length / segment.rule.workDaysPerWeek,
    0,
  );
}

function policyTimestamp(
  input: AssignmentLeaveLedgerInput,
  policy: AssignmentLeaveCalculationPolicy,
  covered: CoveredInterval,
): number {
  const requested =
    policy.carryOverPolicyAt === 'YEAR_START'
      ? Date.UTC(input.year, 0, 1)
      : policy.carryOverPolicyAt === 'YEAR_END'
        ? Date.UTC(input.year, 11, 31)
        : utcDateTimestamp(input.asOfDate);
  return Math.min(Math.max(requested, covered.from), covered.to);
}

function segmentAt(segments: NormalizedSegment[], timestamp: number): AssignmentLeaveSegment {
  const selected = segments.find((segment) => segment.from <= timestamp && timestamp <= segment.to);
  if (selected === undefined) {
    throw new AssignmentLeaveLedgerError(
      'INVALID_SEGMENT_COVERAGE',
      'No leave segment supplies the selected carry-over policy instant.',
    );
  }
  return selected.segment;
}

/**
 * Compute a ledger across versioned assignment terms using only an explicit
 * caller-supplied calculation policy. These options are configurable
 * computation choices and do not assert institutional leave rules.
 */
export function calculateAssignmentLeaveLedger(
  input: AssignmentLeaveLedgerInput,
): LeaveLedgerResult {
  const normalized = normalizeSegments(input.segments);
  const covered = coveredEmploymentInterval(input);

  if (covered === undefined) {
    const first = normalized[0];
    if (first === undefined) {
      throw new AssignmentLeaveLedgerError(
        'INVALID_SEGMENT_COVERAGE',
        'At least one leave segment is required.',
      );
    }
    const hasDifferingConfiguration = normalized.some(
      ({ segment }) => !sameBusinessConfiguration(first.segment, segment),
    );
    if (hasDifferingConfiguration) {
      requireSupportedPolicy(input.calculationPolicy);
      throw new AssignmentLeaveLedgerError(
        'INVALID_SEGMENT_COVERAGE',
        'The employment interval does not overlap the requested ledger year.',
      );
    }
    return calculateLeaveLedger(input, first.segment.rule);
  }

  const segments = clipAndValidateCoverage(normalized, covered);
  const first = segments[0];
  if (first === undefined) {
    throw new AssignmentLeaveLedgerError(
      'INVALID_SEGMENT_COVERAGE',
      'At least one leave segment is required.',
    );
  }

  const hasDifferingConfiguration = segments.some(
    ({ segment }) => !sameBusinessConfiguration(first.segment, segment),
  );
  if (!hasDifferingConfiguration) {
    return calculateLeaveLedger(input, first.segment.rule);
  }

  const policy = requireSupportedPolicy(input.calculationPolicy);
  const entitlementUnrounded = segments.reduce(
    (total, segment) =>
      total +
      segment.segment.rule.annualEntitlementDays *
        partTimeRatio(segment.segment, policy.partTimeBasis) *
        (coveredDays(segment) / daysInYear(input.year)),
    0,
  );
  const entitlementDays = roundToTwo(entitlementUnrounded);
  const carryOverRule = segmentAt(segments, policyTimestamp(input, policy, covered)).rule;
  const base = calculateLeaveLedger(input, carryOverRule);

  return {
    ...base,
    entitlementDays,
    remainingDays: roundToTwo(base.remainingDays - base.entitlementDays + entitlementDays),
  };
}
