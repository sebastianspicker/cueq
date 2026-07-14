import {
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_SURCHARGE_RULE,
} from '@cueq/policy';
import type { SurchargeCategory } from '@cueq/policy';
import { toHolidaySet } from '@cueq/shared';
import type { DomainWarning, RuleViolation } from '../types';
import { roundToTwo, toViolation } from '../utils';
import {
  addOverlapViolations,
  classifyIntervals,
  mergeWorkIntervals,
} from './interval-classification';
import { recordPauseMinutes, recordWorkMinutes } from './minute-accounting';
import type { DailyTotals } from './minute-accounting';
import {
  addDailyRuleOutcomes,
  addRestViolations,
  addWeeklyMaxHoursViolation,
  buildSurchargeMinutes,
} from './rule-outcomes';
import { parseLocalTimeToMinute } from './surcharge';
import type { TimeEnginePolicy, TimeRuleEvaluationInput, TimeRuleEvaluationResult } from './types';

export type {
  TimeEnginePolicy,
  TimeRuleEvaluationInput,
  TimeRuleEvaluationResult,
  TimeRuleInterval,
} from './types';
export type { PlausibilityInterval } from './plausibility';
export { evaluatePlausibility } from './plausibility';
export type { FlextimeWeekBooking, FlextimeWeekInput, FlextimeWeekResult } from './flextime';
export { calculateFlextimeWeek } from './flextime';
export type { OnCallDeployment, OnCallRestInput, OnCallRestResult } from './oncall-rest';
export { evaluateOnCallRestCompliance } from './oncall-rest';

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
  const normalizedPauseIntervals = mergeWorkIntervals(
    [...pauseIntervals]
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
  recordPauseMinutes(normalizedPauseIntervals, formatter, daily);
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
