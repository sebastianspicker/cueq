/** Calculates weekly flextime balances while applying break, rest, and maximum-hours policy. */
import { DEFAULT_BREAK_RULE, DEFAULT_MAX_HOURS_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { CoreFlextimeCalculationContract } from '../generated/schema-contracts.js';
import { roundToTwo } from '../numerical/precision.js';
import { toViolation } from '../rule-outcomes/violation.js';
import type { DomainWarning, PlausibilityIssue, RuleViolation } from '../types.js';
import { requiredBreakMinutes } from './break-rules.js';
import type { PlausibilityInterval } from './plausibility.js';
import { evaluatePlausibility } from './plausibility.js';
import { addDailyMaxHoursOutcome } from './rule-outcomes.js';
import type { TimeEnginePolicy } from './types.js';

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

type DailyTotals = { workedHours: number; breakMinutes: number; hasImplicitBreakMinutes: boolean };

function collectDailyTotals(bookings: FlextimeWeekBooking[]): Map<string, DailyTotals> {
  const dailyTotals = new Map<string, DailyTotals>();
  for (const booking of bookings) {
    const totals = dailyTotals.get(booking.day) ?? {
      workedHours: 0,
      breakMinutes: 0,
      hasImplicitBreakMinutes: false,
    };
    totals.workedHours += booking.workedHours;
    if (booking.breakMinutes === undefined) {
      totals.hasImplicitBreakMinutes = true;
    } else {
      totals.breakMinutes += booking.breakMinutes;
    }
    dailyTotals.set(booking.day, totals);
  }
  return dailyTotals;
}

function addDailyRuleFindings(
  dailyTotals: Map<string, DailyTotals>,
  policy: Pick<TimeEnginePolicy, 'breakRule' | 'maxHoursRule'>,
  violations: RuleViolation[],
  warnings: DomainWarning[],
) {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  for (const [day, totals] of dailyTotals) {
    const workedHours = roundToTwo(totals.workedHours);
    addDailyMaxHoursOutcome(day, workedHours, maxHoursRule, warnings, violations);
    if (totals.hasImplicitBreakMinutes) continue;
    const expectedBreak = requiredBreakMinutes(workedHours, breakRule);
    if (totals.breakMinutes < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${totals.breakMinutes} minutes were recorded.`,
          ruleId: breakRule.id,
          ruleName: breakRule.name,
          context: { day, requiredBreakMinutes: expectedBreak, breakMinutes: totals.breakMinutes },
        }),
      );
    }
  }
}

/** Evaluate a weekly flextime summary and preserve separate violations, warnings, and plausibility findings. */
export function calculateFlextimeWeek(
  input: FlextimeWeekInput,
  policy: TimeEnginePolicy = {},
): FlextimeWeekResult {
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;

  const violations: RuleViolation[] = [];
  const warnings: DomainWarning[] = [];

  const actualHours = roundToTwo(
    input.bookings.reduce((sum, booking) => sum + booking.workedHours, 0),
  );

  addDailyRuleFindings(collectDailyTotals(input.bookings), policy, violations, warnings);

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
