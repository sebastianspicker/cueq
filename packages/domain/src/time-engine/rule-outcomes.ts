/** Converts accumulated time totals into stable rule violations, warnings, and surcharge output. */
import type { BreakRule, MaxHoursRule, RestRule, SurchargeCategory } from '@cueq/policy';
import { compareIsoInstants, diffHours } from '../calendar/instant.js';
import { roundToTwo } from '../numerical/precision.js';
import { toViolation } from '../rule-outcomes/violation.js';
import type { DomainWarning, RuleViolation } from '../types.js';
import { requiredBreakMinutes } from './break-rules.js';
import type { CategoryConfigByCategory, DailyTotals } from './minute-accounting.js';
import type { TimeRuleEvaluationResult, TimeRuleInterval } from './types.js';

/** Add minimum-rest violations between consecutive local work periods. */
export function addRestViolations(
  intervals: TimeRuleInterval[],
  rule: RestRule,
  violations: RuleViolation[],
  timezone: string,
): void {
  const localDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = (instant: string) => {
    const parts = localDateFormatter.formatToParts(new Date(instant));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };
  const workPeriods: Array<TimeRuleInterval & { localStartDate: string }> = [];
  for (const interval of intervals) {
    const localStartDate = localDate(interval.start);
    const current = workPeriods[workPeriods.length - 1];
    if (current?.localStartDate === localStartDate) {
      if (compareIsoInstants(interval.end, current.end) > 0) {
        current.end = interval.end;
      }
      continue;
    }
    workPeriods.push({ ...interval, localStartDate });
  }

  for (let index = 0; index < workPeriods.length - 1; index += 1) {
    const current = workPeriods[index];
    const next = workPeriods[index + 1];
    if (!current || !next) continue;
    const restHours = roundToTwo(diffHours(current.end, next.start));
    if (restHours < rule.minRestHours) {
      violations.push(
        toViolation({
          code: 'REST_HOURS_DEFICIT',
          message: `Rest period ${restHours}h is below required ${rule.minRestHours}h.`,
          ruleId: rule.id,
          ruleName: rule.name,
          context: { previousEnd: current.end, nextStart: next.start, restHours },
        }),
      );
    }
  }
}

/** Add the daily maximum-hours warning or violation for one local workday. */
export function addDailyMaxHoursOutcome(
  day: string,
  workedHours: number,
  maxRule: MaxHoursRule,
  warnings: DomainWarning[],
  violations: RuleViolation[],
): void {
  if (workedHours > maxRule.maxDailyHoursExtended) {
    violations.push(
      toViolation({
        code: 'MAX_DAILY_HOURS_EXCEEDED',
        message: `Worked hours ${workedHours} exceed daily maximum ${maxRule.maxDailyHoursExtended}.`,
        ruleId: maxRule.id,
        ruleName: maxRule.name,
        context: { day, workedHours },
      }),
    );
  } else if (workedHours > maxRule.maxDailyHours) {
    warnings.push({
      code: 'MAX_DAILY_HOURS_EXTENDED_RANGE',
      message:
        'Daily hours exceed the standard maximum and require compensatory tracking within the reference period.',
      context: { day, workedHours },
    });
  }
}

/** Convert per-day work and pause totals into daily-hour and break outcomes. */
export function addDailyRuleOutcomes(
  daily: Map<string, DailyTotals>,
  maxRule: MaxHoursRule,
  breakRule: BreakRule,
  warnings: DomainWarning[],
  violations: RuleViolation[],
): void {
  for (const [day, totals] of daily) {
    const workedHours = roundToTwo(totals.workMinutes / 60);
    addDailyMaxHoursOutcome(day, workedHours, maxRule, warnings, violations);

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

/** Add the weekly maximum-hours violation when the accumulated total exceeds policy. */
export function addWeeklyMaxHoursViolation(
  actualHours: number,
  rule: MaxHoursRule,
  violations: RuleViolation[],
): void {
  if (actualHours > rule.maxWeeklyHours) {
    violations.push(
      toViolation({
        code: 'MAX_WEEKLY_HOURS_EXCEEDED',
        message: `Weekly worked hours ${actualHours} exceed maximum ${rule.maxWeeklyHours}.`,
        ruleId: rule.id,
        ruleName: rule.name,
      }),
    );
  }
}

/** Produce priority-ordered surcharge totals with the configured rates. */
export function buildSurchargeMinutes(
  buckets: Map<SurchargeCategory, number>,
  config: CategoryConfigByCategory,
): TimeRuleEvaluationResult['surchargeMinutes'] {
  return [...buckets]
    .map(([category, minutes]) => ({
      category,
      minutes,
      ratePercent: config.get(category)?.ratePercent ?? 0,
    }))
    .sort(
      (left, right) =>
        (config.get(right.category)?.priority ?? 0) - (config.get(left.category)?.priority ?? 0),
    );
}
