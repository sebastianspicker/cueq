import { DEFAULT_BREAK_RULE, DEFAULT_MAX_HOURS_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { BreakRule, MaxHoursRule, RestRule } from '@cueq/policy';
import type { CoreFlextimeCalculationContract, CoreOnCallRestContract } from '@cueq/shared';
import type { DomainWarning, PlausibilityIssue, RuleViolation } from '../types';
import { diffHours, overlapExists, roundToTwo, toViolation } from '../utils';

export type FlextimeWeekBooking = CoreFlextimeCalculationContract['input']['bookings'][number];

export interface PlausibilityInterval {
  start: string;
  end?: string;
}

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

export interface TimeEnginePolicy {
  breakRule?: BreakRule;
  maxHoursRule?: MaxHoursRule;
  restRule?: RestRule;
}

function requiredBreakMinutes(workedHours: number, rule: BreakRule): number {
  return rule.thresholds
    .filter((threshold) => workedHours >= threshold.workedHoursMin)
    .reduce((minutes, threshold) => Math.max(minutes, threshold.requiredBreakMinutes), 0);
}

function evaluatePlausibility(intervals: PlausibilityInterval[]): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const completeIntervals: Array<{ start: string; end: string }> = [];

  intervals.forEach((interval, index) => {
    if (!interval.end) {
      issues.push({
        code: 'MISSING_END',
        severity: 'ERROR',
        message: 'Booking interval has no end timestamp.',
        index,
      });
      return;
    }

    const durationHours = diffHours(interval.start, interval.end);
    if (durationHours <= 0) {
      issues.push({
        code: 'NEGATIVE_DURATION',
        severity: 'ERROR',
        message: 'Booking interval has negative or zero duration.',
        index,
        context: { start: interval.start, end: interval.end },
      });
      return;
    }

    completeIntervals.push({ start: interval.start, end: interval.end });
  });

  issues.push(...overlapExists(completeIntervals));

  return issues;
}

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
    if ((booking.breakMinutes ?? expectedBreak) < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${booking.breakMinutes ?? 0} minutes were recorded.`,
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

export interface OnCallDeployment {
  start: string;
  end: string;
}

export type OnCallRestInput = CoreOnCallRestContract['input'] & {
  personCode?: string;
  deployments: OnCallDeployment[];
};

export type OnCallRestResult = Omit<CoreOnCallRestContract['output'], 'violations'> & {
  violations: RuleViolation[];
};

export function evaluateOnCallRestCompliance(
  input: OnCallRestInput,
  policy: { restRule?: RestRule } = {},
): OnCallRestResult {
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;
  const minimumRestHours =
    restRule.onCallRestReduction?.enabled &&
    restRule.onCallRestReduction.minRestHoursAfterDeployment
      ? restRule.onCallRestReduction.minRestHoursAfterDeployment
      : restRule.minRestHours;

  const lastDeployment = [...input.deployments].sort((left, right) =>
    right.end.localeCompare(left.end),
  )[0];

  if (!lastDeployment) {
    return {
      restHoursAfterDeployment: 0,
      minimumRestHours,
      compliant: true,
      violations: [],
    };
  }

  const restHoursAfterDeployment = roundToTwo(diffHours(lastDeployment.end, input.nextShiftStart));
  const compliant = restHoursAfterDeployment >= minimumRestHours;

  const violations = compliant
    ? []
    : [
        toViolation({
          code: 'ONCALL_REST_DEFICIT',
          message: `Rest after deployment is ${restHoursAfterDeployment}h and below required ${minimumRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
          context: {
            deploymentEnd: lastDeployment.end,
            nextShiftStart: input.nextShiftStart,
          },
        }),
      ];

  return {
    restHoursAfterDeployment,
    minimumRestHours,
    compliant,
    violations,
  };
}
