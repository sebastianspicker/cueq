import { DEFAULT_BREAK_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { BreakRule, RestRule } from '@cueq/policy';
import { diffHours } from '../calendar/instant.js';
import type { CoreShiftComplianceContract } from '../generated/schema-contracts.js';
import { roundToTwo } from '../numerical/precision.js';
import { toViolation } from '../rule-outcomes/violation.js';
import { requiredBreakMinutes } from '../time-engine/break-rules.js';
import type { RuleViolation } from '../types.js';

export interface ShiftWindow {
  type: string;
  start: string;
  end: string;
}

export type ShiftComplianceInput = CoreShiftComplianceContract['input'] & {
  personCode?: string;
  shift: ShiftWindow;
  previousShiftEnd?: string;
};

export type ShiftComplianceResult = Omit<CoreShiftComplianceContract['output'], 'violations'> & {
  violations: RuleViolation[];
};

/** Evaluate one shift against duration, break, and inter-shift rest rules. */
export function evaluateShiftCompliance(
  input: ShiftComplianceInput,
  policy: { breakRule?: BreakRule; restRule?: RestRule } = {},
): ShiftComplianceResult {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;

  const shiftHours = diffHours(input.shift.start, input.shift.end);
  const violations: RuleViolation[] = [];

  if (shiftHours <= 0) {
    return {
      workedHours: 0,
      requiredBreakMinutes: 0,
      violations: [
        toViolation({
          code: 'INVALID_SHIFT_INTERVAL',
          message: 'Shift end must be after shift start.',
          context: { start: input.shift.start, end: input.shift.end },
        }),
      ],
    };
  }

  const requiredBreak = requiredBreakMinutes(shiftHours, breakRule, input.shift.type);

  if (input.recordedBreakMinutes < requiredBreak) {
    violations.push(
      toViolation({
        code: 'BREAK_DEFICIT',
        message: `Shift requires ${requiredBreak} minutes break but ${input.recordedBreakMinutes} were recorded.`,
        ruleId: breakRule.id,
        ruleName: breakRule.name,
      }),
    );
  }

  if (input.previousShiftEnd) {
    const restHours = diffHours(input.previousShiftEnd, input.shift.start);
    if (restHours < restRule.minRestHours) {
      violations.push(
        toViolation({
          code: 'REST_HOURS_DEFICIT',
          message: `Rest between shifts is ${roundToTwo(restHours)}h and below ${restRule.minRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
        }),
      );
    }
  }

  return {
    workedHours: roundToTwo(shiftHours - input.recordedBreakMinutes / 60),
    requiredBreakMinutes: requiredBreak,
    violations,
  };
}

export interface MinStaffingInput {
  requiredMinStaffing: number;
  assignedCount: number;
}

export interface MinStaffingResult {
  compliant: boolean;
  shortfall: number;
}

/** Report whether assigned headcount meets the configured staffing floor. */
export function evaluateMinStaffing(input: MinStaffingInput): MinStaffingResult {
  const shortfall = Math.max(input.requiredMinStaffing - input.assignedCount, 0);
  return {
    compliant: shortfall === 0,
    shortfall,
  };
}
