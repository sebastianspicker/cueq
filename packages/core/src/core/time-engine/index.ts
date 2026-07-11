import {
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_SURCHARGE_RULE,
} from '@cueq/policy';
import type {
  BreakRule,
  MaxHoursRule,
  RestRule,
  SurchargeCategory,
  SurchargeRule,
} from '@cueq/policy';
import { toHolidaySet } from '@cueq/shared';
import type { CoreTimeRuleEvaluationContract } from '@cueq/shared';
import { requiredBreakMinutes } from '../break-utils';
import type { DomainWarning, RuleViolation } from '../types';
import { diffHours, overlapExists, roundToTwo, toViolation } from '../utils';
import {
  isWithinWindow,
  isWorkIntervalType,
  localMinuteInfo,
  parseLocalTimeToMinute,
  selectSurchargeCategory,
} from './surcharge';
import type { TimeEnginePolicy } from './types';

export type { TimeEnginePolicy } from './types';
export type { PlausibilityInterval } from './plausibility';
export { evaluatePlausibility } from './plausibility';
export type { FlextimeWeekBooking, FlextimeWeekInput, FlextimeWeekResult } from './flextime';
export { calculateFlextimeWeek } from './flextime';
export type { OnCallDeployment, OnCallRestInput, OnCallRestResult } from './oncall-rest';
export { evaluateOnCallRestCompliance } from './oncall-rest';

const MINUTE_MS = 60_000;

type DailyTotals = { workMinutes: number; pauseMinutes: number };
type SurchargeCategoryConfig = SurchargeRule['categories'][number];
type CategoryConfigByCategory = Map<SurchargeCategory, SurchargeCategoryConfig>;

interface ClassifiedIntervals {
  workIntervals: TimeRuleInterval[];
  pauseIntervals: TimeRuleInterval[];
}

function mergeWorkIntervals(intervals: TimeRuleInterval[]): TimeRuleInterval[] {
  if (intervals.length <= 1) {
    return intervals;
  }

  const merged: TimeRuleInterval[] = [];

  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(interval);
      continue;
    }

    if (previous.end <= interval.start) {
      merged.push(interval);
      continue;
    }

    if (interval.end > previous.end) {
      previous.end = interval.end;
    }
  }

  return merged;
}

export type TimeRuleInterval = CoreTimeRuleEvaluationContract['input']['intervals'][number];

export type TimeRuleEvaluationInput = CoreTimeRuleEvaluationContract['input'] & {
  personCode?: string;
};

export type TimeRuleEvaluationResult = Omit<
  CoreTimeRuleEvaluationContract['output'],
  'violations' | 'warnings'
> & {
  violations: RuleViolation[];
  warnings: DomainWarning[];
};

function classifyIntervals(
  sortedIntervals: TimeRuleInterval[],
  violations: RuleViolation[],
): ClassifiedIntervals {
  const workIntervals: TimeRuleInterval[] = [];
  const pauseIntervals: TimeRuleInterval[] = [];

  for (const interval of sortedIntervals) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      violations.push(
        toViolation({
          code: 'INVALID_INTERVAL',
          message: 'Interval end must be after start and both must be valid ISO datetimes.',
          context: { start: interval.start, end: interval.end, type: interval.type },
        }),
      );
      continue;
    }

    if (isWorkIntervalType(interval.type)) {
      workIntervals.push(interval);
    } else if (interval.type === 'PAUSE') {
      pauseIntervals.push(interval);
    }
  }

  return { workIntervals, pauseIntervals };
}

function recordSurchargeMinute(
  localMinute: ReturnType<typeof localMinuteInfo>,
  holidayDates: Set<string>,
  nightStart: number | null,
  nightEnd: number | null,
  categoryConfigByCategory: CategoryConfigByCategory,
  surchargeBuckets: Map<SurchargeCategory, number>,
): void {
  const matchedCategories: SurchargeCategory[] = [];
  if (holidayDates.has(localMinute.isoDate)) {
    matchedCategories.push('HOLIDAY');
  }
  if (localMinute.weekday === 0 || localMinute.weekday === 6) {
    matchedCategories.push('WEEKEND');
  }
  if (
    nightStart !== null &&
    nightEnd !== null &&
    isWithinWindow(localMinute.localMinuteOfDay, nightStart, nightEnd)
  ) {
    matchedCategories.push('NIGHT');
  }

  const selected = selectSurchargeCategory(matchedCategories, categoryConfigByCategory);
  if (selected) {
    surchargeBuckets.set(selected, (surchargeBuckets.get(selected) ?? 0) + 1);
  }
}

function recordWorkMinutes(
  intervals: TimeRuleInterval[],
  formatter: Intl.DateTimeFormat,
  daily: Map<string, DailyTotals>,
  holidayDates: Set<string>,
  nightStart: number | null,
  nightEnd: number | null,
  categoryConfigByCategory: CategoryConfigByCategory,
  surchargeBuckets: Map<SurchargeCategory, number>,
): number {
  let totalWorkMinutes = 0;

  for (const interval of intervals) {
    const startMs = new Date(interval.start).getTime();
    const endMs = new Date(interval.end).getTime();

    for (let cursor = startMs; cursor < endMs; cursor += MINUTE_MS) {
      const localMinute = localMinuteInfo(cursor, formatter);
      const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };

      day.workMinutes += 1;
      totalWorkMinutes += 1;
      recordSurchargeMinute(
        localMinute,
        holidayDates,
        nightStart,
        nightEnd,
        categoryConfigByCategory,
        surchargeBuckets,
      );

      daily.set(localMinute.isoDate, day);
    }
  }

  return totalWorkMinutes;
}

function recordPauseMinutes(
  intervals: TimeRuleInterval[],
  formatter: Intl.DateTimeFormat,
  daily: Map<string, DailyTotals>,
): void {
  for (const interval of intervals) {
    const startMs = new Date(interval.start).getTime();
    const endMs = new Date(interval.end).getTime();

    for (let cursor = startMs; cursor < endMs; cursor += MINUTE_MS) {
      const localMinute = localMinuteInfo(cursor, formatter);
      const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };
      day.pauseMinutes += 1;
      daily.set(localMinute.isoDate, day);
    }
  }
}

function addOverlapViolations(
  workIntervals: TimeRuleInterval[],
  violations: RuleViolation[],
): void {
  const overlapIssues = overlapExists(workIntervals.map(({ start, end }) => ({ start, end })));
  for (const issue of overlapIssues) {
    violations.push(
      toViolation({
        code: 'OVERLAP',
        message: issue.message,
        context: issue.context,
      }),
    );
  }
}

function addRestViolations(
  normalizedWorkIntervals: TimeRuleInterval[],
  restRule: RestRule,
  violations: RuleViolation[],
): void {
  const sortedRestIntervals = [...normalizedWorkIntervals].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  for (let index = 0; index < sortedRestIntervals.length - 1; index += 1) {
    const current = sortedRestIntervals[index];
    const next = sortedRestIntervals[index + 1];
    if (!current || !next) {
      continue;
    }

    const restHours = roundToTwo(diffHours(current.end, next.start));
    if (restHours < restRule.minRestHours) {
      violations.push(
        toViolation({
          code: 'REST_HOURS_DEFICIT',
          message: `Rest period ${restHours}h is below required ${restRule.minRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
          context: { previousEnd: current.end, nextStart: next.start, restHours },
        }),
      );
    }
  }
}

function addDailyRuleOutcomes(
  daily: Map<string, DailyTotals>,
  maxHoursRule: MaxHoursRule,
  breakRule: BreakRule,
  warnings: DomainWarning[],
  violations: RuleViolation[],
): void {
  for (const [day, totals] of daily.entries()) {
    const workedHours = roundToTwo(totals.workMinutes / 60);
    if (workedHours > maxHoursRule.maxDailyHoursExtended) {
      violations.push(
        toViolation({
          code: 'MAX_DAILY_HOURS_EXCEEDED',
          message: `Worked hours ${workedHours} exceed daily maximum ${maxHoursRule.maxDailyHoursExtended}.`,
          ruleId: maxHoursRule.id,
          ruleName: maxHoursRule.name,
          context: { day, workedHours },
        }),
      );
    } else if (workedHours > maxHoursRule.maxDailyHours) {
      warnings.push({
        code: 'MAX_DAILY_HOURS_EXTENDED_RANGE',
        message:
          'Daily hours exceed the standard maximum and require compensatory tracking within the reference period.',
        context: { day, workedHours },
      });
    }

    const expectedBreak = requiredBreakMinutes(workedHours, breakRule);
    if (totals.pauseMinutes < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${totals.pauseMinutes} minutes were recorded.`,
          ruleId: breakRule.id,
          ruleName: breakRule.name,
          context: { day, requiredBreakMinutes: expectedBreak, breakMinutes: totals.pauseMinutes },
        }),
      );
    }
  }
}

function addWeeklyMaxHoursViolation(
  actualHours: number,
  maxHoursRule: MaxHoursRule,
  violations: RuleViolation[],
): void {
  if (actualHours > maxHoursRule.maxWeeklyHours) {
    violations.push(
      toViolation({
        code: 'MAX_WEEKLY_HOURS_EXCEEDED',
        message: `Weekly worked hours ${actualHours} exceed maximum ${maxHoursRule.maxWeeklyHours}.`,
        ruleId: maxHoursRule.id,
        ruleName: maxHoursRule.name,
      }),
    );
  }
}

function buildSurchargeMinutes(
  surchargeBuckets: Map<SurchargeCategory, number>,
  categoryConfigByCategory: CategoryConfigByCategory,
): TimeRuleEvaluationResult['surchargeMinutes'] {
  return [...surchargeBuckets.entries()]
    .map(([category, minutes]) => ({
      category,
      minutes,
      ratePercent: categoryConfigByCategory.get(category)?.ratePercent ?? 0,
    }))
    .sort((left, right) => {
      const leftPriority = categoryConfigByCategory.get(left.category)?.priority ?? 0;
      const rightPriority = categoryConfigByCategory.get(right.category)?.priority ?? 0;
      return rightPriority - leftPriority;
    });
}

/**
 * Evaluate ArbZG / TV-L time-tracking rules for a set of work intervals.
 *
 * Checks daily max hours, weekly max hours, minimum rest between shifts,
 * required break durations, and computes surcharge category buckets
 * (night, weekend, holiday) per the configured surcharge rule.
 *
 * Returns actual hours, delta vs. target, any rule violations, and warnings.
 */
export function evaluateTimeRules(
  input: TimeRuleEvaluationInput,
  policy: TimeEnginePolicy = {},
): TimeRuleEvaluationResult {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;
  const surchargeRule = policy.surchargeRule ?? DEFAULT_SURCHARGE_RULE;
  const timezone = input.timezone ?? surchargeRule.timezoneDefault ?? 'Europe/Berlin';

  const warnings: DomainWarning[] = [];
  const violations: RuleViolation[] = [];
  const holidayDates = toHolidaySet(input.holidayDates);
  const daily = new Map<string, DailyTotals>();
  const surchargeBuckets = new Map<SurchargeCategory, number>();

  const sortedIntervals = [...input.intervals].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const nightStart = parseLocalTimeToMinute(surchargeRule.nightWindow.startLocalTime);
  const nightEnd = parseLocalTimeToMinute(surchargeRule.nightWindow.endLocalTime);
  const hasValidNightWindow = nightStart !== null && nightEnd !== null;
  if (!hasValidNightWindow) {
    violations.push(
      toViolation({
        code: 'INVALID_SURCHARGE_NIGHT_WINDOW',
        message: 'Surcharge nightWindow startLocalTime and endLocalTime must be valid HH:MM times.',
        context: { nightWindow: surchargeRule.nightWindow },
      }),
    );
  }
  const categoryConfigByCategory = new Map(
    surchargeRule.categories.map((entry) => [entry.category, entry]),
  );
  const { workIntervals, pauseIntervals } = classifyIntervals(sortedIntervals, violations);

  addOverlapViolations(workIntervals, violations);
  const normalizedWorkIntervals = mergeWorkIntervals(
    [...workIntervals]
      .map((interval) => ({ ...interval }))
      .sort((left, right) => left.start.localeCompare(right.start)),
  );

  const totalWorkMinutes = recordWorkMinutes(
    normalizedWorkIntervals,
    formatter,
    daily,
    holidayDates,
    nightStart,
    nightEnd,
    categoryConfigByCategory,
    surchargeBuckets,
  );
  recordPauseMinutes(pauseIntervals, formatter, daily);
  addRestViolations(normalizedWorkIntervals, restRule, violations);
  addDailyRuleOutcomes(daily, maxHoursRule, breakRule, warnings, violations);

  const actualHours = roundToTwo(totalWorkMinutes / 60);
  addWeeklyMaxHoursViolation(actualHours, maxHoursRule, violations);

  return {
    actualHours,
    deltaHours: roundToTwo(actualHours - input.targetHours),
    violations,
    warnings,
    surchargeMinutes: buildSurchargeMinutes(surchargeBuckets, categoryConfigByCategory),
  };
}
