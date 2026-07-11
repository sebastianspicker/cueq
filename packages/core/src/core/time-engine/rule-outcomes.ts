import type { BreakRule, MaxHoursRule, RestRule, SurchargeCategory } from '@cueq/policy';
import { requiredBreakMinutes } from '../break-utils';
import type { DomainWarning, RuleViolation } from '../types';
import { diffHours, roundToTwo, toViolation } from '../utils';
import type { CategoryConfigByCategory, DailyTotals } from './minute-accounting';
import type { TimeRuleEvaluationResult, TimeRuleInterval } from './types';

export function addRestViolations(
  intervals: TimeRuleInterval[],
  rule: RestRule,
  violations: RuleViolation[],
): void {
  for (let index = 0; index < intervals.length - 1; index += 1) {
    const current = intervals[index];
    const next = intervals[index + 1];
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

export function addDailyRuleOutcomes(
  daily: Map<string, DailyTotals>,
  maxRule: MaxHoursRule,
  breakRule: BreakRule,
  warnings: DomainWarning[],
  violations: RuleViolation[],
): void {
  for (const [day, totals] of daily) {
    const workedHours = roundToTwo(totals.workMinutes / 60);
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
