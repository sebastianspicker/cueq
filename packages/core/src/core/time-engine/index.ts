import {
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_SURCHARGE_RULE,
} from '@cueq/policy';
import type { SurchargeCategory } from '@cueq/policy';
import { toHolidaySet } from '@cueq/shared';
import type { CoreTimeRuleEvaluationContract } from '@cueq/shared';
import { requiredBreakMinutes } from '../break-utils';
import type { DomainWarning, RuleViolation } from '../types';
import { diffHours, roundToTwo, toViolation } from '../utils';
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
  const daily = new Map<string, { workMinutes: number; pauseMinutes: number }>();
  const surchargeBuckets = new Map<SurchargeCategory, number>();
  let totalWorkMinutes = 0;

  const sortedIntervals = [...input.intervals].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const workIntervalsForRest: TimeRuleInterval[] = [];

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
  const categoryConfigByCategory = new Map(
    surchargeRule.categories.map((entry) => [entry.category, entry]),
  );

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
      workIntervalsForRest.push(interval);
    }

    for (let cursor = startMs; cursor < endMs; cursor += MINUTE_MS) {
      const localMinute = localMinuteInfo(cursor, formatter);
      const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };

      if (isWorkIntervalType(interval.type)) {
        day.workMinutes += 1;
        totalWorkMinutes += 1;

        const matchedCategories: SurchargeCategory[] = [];
        if (holidayDates.has(localMinute.isoDate)) {
          matchedCategories.push('HOLIDAY');
        }
        if (localMinute.weekday === 0 || localMinute.weekday === 6) {
          matchedCategories.push('WEEKEND');
        }
        if (isWithinWindow(localMinute.localMinuteOfDay, nightStart, nightEnd)) {
          matchedCategories.push('NIGHT');
        }

        const selected = selectSurchargeCategory(matchedCategories, categoryConfigByCategory);
        if (selected) {
          surchargeBuckets.set(selected, (surchargeBuckets.get(selected) ?? 0) + 1);
        }
      } else if (interval.type === 'PAUSE') {
        day.pauseMinutes += 1;
      }

      daily.set(localMinute.isoDate, day);
    }
  }

  const sortedRestIntervals = [...workIntervalsForRest].sort((left, right) =>
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

  const actualHours = roundToTwo(totalWorkMinutes / 60);
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

  const surchargeMinutes = [...surchargeBuckets.entries()]
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

  return {
    actualHours,
    deltaHours: roundToTwo(actualHours - input.targetHours),
    violations,
    warnings,
    surchargeMinutes,
  };
}
