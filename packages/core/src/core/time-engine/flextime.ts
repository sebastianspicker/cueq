import { DEFAULT_BREAK_RULE, DEFAULT_MAX_HOURS_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { CoreFlextimeCalculationContract } from '@cueq/shared';
import { requiredBreakMinutes } from '../break-utils';
import type { DomainWarning, PlausibilityIssue, RuleViolation } from '../types';
import { roundToTwo, toViolation } from '../utils';
import type { PlausibilityInterval } from './plausibility';
import { evaluatePlausibility } from './plausibility';
import type { TimeEnginePolicy } from './types';

export type FlextimeWeekBooking = CoreFlextimeCalculationContract['input']['bookings'][number];

export type FlextimeWeekInput = CoreFlextimeCalculationContract['input'] & {
  personCode?: string;
  bookingIntervals?: PlausibilityInterval[];
  dailyRestHours?: number[];
};

export type FlextimeWeekResult = Omit<CoreFlextimeCalculationContract['output'], 'violations'> & {
  violations: RuleViolation[];
  warnings: DomainWarning[];
  plausibilityIssues: PlausibilityIssue[];
};

export function calculateFlextimeWeek(
  input: FlextimeWeekInput,
  policy: TimeEnginePolicy = {},
): FlextimeWeekResult {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;

  const violations: RuleViolation[] = [];
  const warnings: DomainWarning[] = [];

  const actualHours = roundToTwo(
    input.bookings.reduce((sum, booking) => sum + booking.workedHours, 0),
  );

  for (const booking of input.bookings) {
    if (booking.workedHours > maxHoursRule.maxDailyHoursExtended) {
      violations.push(
        toViolation({
          code: 'MAX_DAILY_HOURS_EXCEEDED',
          message: `Worked hours ${booking.workedHours} exceed daily maximum ${maxHoursRule.maxDailyHoursExtended}.`,
          ruleId: maxHoursRule.id,
          ruleName: maxHoursRule.name,
          context: { day: booking.day, workedHours: booking.workedHours },
        }),
      );
    } else if (booking.workedHours > maxHoursRule.maxDailyHours) {
      warnings.push({
        code: 'MAX_DAILY_HOURS_EXTENDED_RANGE',
        message:
          'Daily hours exceed the standard maximum and require compensatory tracking within the reference period.',
        context: { day: booking.day, workedHours: booking.workedHours },
      });
    }

    const expectedBreak = requiredBreakMinutes(booking.workedHours, breakRule);
    if (booking.breakMinutes !== undefined && booking.breakMinutes < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${booking.breakMinutes} minutes were recorded.`,
          ruleId: breakRule.id,
          ruleName: breakRule.name,
          context: { day: booking.day, requiredBreakMinutes: expectedBreak },
        }),
      );
    }
  }

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

  if (input.dailyRestHours) {
    input.dailyRestHours.forEach((restHours, index) => {
      if (restHours < restRule.minRestHours) {
        violations.push(
          toViolation({
            code: 'REST_HOURS_DEFICIT',
            message: `Rest period ${restHours}h is below required ${restRule.minRestHours}h.`,
            ruleId: restRule.id,
            ruleName: restRule.name,
            context: { index, restHours },
          }),
        );
      }
    });
  }

  const plausibilityIssues = evaluatePlausibility(input.bookingIntervals ?? []);

  return {
    actualHours,
    deltaHours: roundToTwo(actualHours - input.targetHours),
    violations,
    warnings,
    plausibilityIssues,
  };
}
