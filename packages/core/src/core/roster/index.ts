import { DEFAULT_BREAK_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { BreakRule, RestRule } from '@cueq/policy';
import type { CoreShiftComplianceContract } from '@cueq/shared';
import type { RuleViolation } from '../types';
import { diffHours, roundToTwo, toViolation } from '../utils';

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

function requiredBreakForShift(shiftType: string, durationHours: number, rule: BreakRule): number {
  const requiredByThreshold = rule.thresholds
    .filter((threshold) => durationHours >= threshold.workedHoursMin)
    .reduce((current, threshold) => Math.max(current, threshold.requiredBreakMinutes), 0);

  // Pforte night shifts use a stricter operational baseline.
  if (shiftType.toUpperCase() === 'NIGHT') {
    return Math.max(requiredByThreshold, 45);
  }

  return requiredByThreshold;
}

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

  const requiredBreakMinutes = requiredBreakForShift(input.shift.type, shiftHours, breakRule);

  if (input.recordedBreakMinutes < requiredBreakMinutes) {
    violations.push(
      toViolation({
        code: 'BREAK_DEFICIT',
        message: `Shift requires ${requiredBreakMinutes} minutes break but ${input.recordedBreakMinutes} were recorded.`,
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
    requiredBreakMinutes,
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

export function evaluateMinStaffing(input: MinStaffingInput): MinStaffingResult {
  const shortfall = Math.max(input.requiredMinStaffing - input.assignedCount, 0);
  return {
    compliant: shortfall === 0,
    shortfall,
  };
}

export interface PlanVsActualSlot {
  slotId: string;
  plannedHeadcount: number;
  actualHeadcount: number;
}

export interface PlanVsActualResult {
  totalSlots: number;
  mismatchedSlots: number;
  complianceRate: number;
}

export function comparePlanVsActual(slots: PlanVsActualSlot[]): PlanVsActualResult {
  if (slots.length === 0) {
    return {
      totalSlots: 0,
      mismatchedSlots: 0,
      complianceRate: 1,
    };
  }

  const mismatchedSlots = slots.filter(
    (slot) => slot.plannedHeadcount !== slot.actualHeadcount,
  ).length;

  return {
    totalSlots: slots.length,
    mismatchedSlots,
    complianceRate: roundToTwo((slots.length - mismatchedSlots) / slots.length),
  };
}
