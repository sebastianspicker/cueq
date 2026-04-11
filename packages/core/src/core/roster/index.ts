import { DEFAULT_BREAK_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import type { BreakRule, RestRule } from '@cueq/policy';
import type { CoreShiftComplianceContract } from '@cueq/shared';
import { requiredBreakMinutes } from '../break-utils';
import { WORK_INTERVAL_TYPES } from '../constants';
import type { PlausibilityIssue, RuleViolation } from '../types';
import { diffHours, overlapExists, roundToTwo, toViolation } from '../utils';

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

export interface PlanVsActualCoverageSlot {
  shiftId: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignedPersonIds: string[];
}

export interface PlanVsActualBooking {
  personId: string;
  startTime: string;
  endTime: string;
  timeTypeCategory: string;
}

export interface PlanVsActualCoverageSlotResult {
  shiftId: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignedHeadcount: number;
  plannedHeadcount: number;
  actualHeadcount: number;
  delta: number;
  compliant: boolean;
}

export interface PlanVsActualCoverageResult extends PlanVsActualResult {
  understaffedSlots: number;
  coverageRate: number;
  slots: PlanVsActualCoverageSlotResult[];
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  // Half-open interval overlap: [start, end)
  return aStart < bEnd && bStart < aEnd;
}

export function evaluatePlanVsActualCoverage(
  slots: PlanVsActualCoverageSlot[],
  bookings: PlanVsActualBooking[],
): PlanVsActualCoverageResult {
  if (slots.length === 0) {
    return {
      totalSlots: 0,
      mismatchedSlots: 0,
      complianceRate: 1,
      understaffedSlots: 0,
      coverageRate: 1,
      slots: [],
    };
  }

  const allowedCategories = WORK_INTERVAL_TYPES;

  const slotResults = slots.map((slot): PlanVsActualCoverageSlotResult => {
    const assignedHeadcount = new Set(slot.assignedPersonIds).size;
    const plannedHeadcount = Math.max(slot.minStaffing, assignedHeadcount);

    const actualPersons = new Set(
      bookings
        .filter((booking) => allowedCategories.has(booking.timeTypeCategory))
        .filter((booking) =>
          overlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime),
        )
        .map((booking) => booking.personId),
    );

    const actualHeadcount = actualPersons.size;

    return {
      shiftId: slot.shiftId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      shiftType: slot.shiftType,
      minStaffing: slot.minStaffing,
      assignedHeadcount,
      plannedHeadcount,
      actualHeadcount,
      delta: actualHeadcount - plannedHeadcount,
      compliant: actualHeadcount >= plannedHeadcount,
    };
  });

  const summary = comparePlanVsActual(
    slotResults.map((slot) => ({
      slotId: slot.shiftId,
      plannedHeadcount: slot.plannedHeadcount,
      actualHeadcount: slot.actualHeadcount,
    })),
  );

  const understaffedSlots = slotResults.filter(
    (slot) => slot.actualHeadcount < slot.minStaffing,
  ).length;

  return {
    ...summary,
    understaffedSlots,
    coverageRate: roundToTwo((slotResults.length - understaffedSlots) / slotResults.length),
    slots: slotResults,
  };
}

// ── Shift overlap detection ──────────────────────────────────────────

export interface PersonShift {
  personCode: string;
  start: string;
  end: string;
}

export interface ShiftOverlapResult {
  personCode: string;
  issues: PlausibilityIssue[];
}

/**
 * Detect overlapping shifts for each person.
 * Groups shifts by personCode and delegates to the generic overlapExists utility.
 */
export function detectShiftOverlaps(shifts: PersonShift[]): ShiftOverlapResult[] {
  const byPerson = new Map<string, PersonShift[]>();
  for (const shift of shifts) {
    const group = byPerson.get(shift.personCode) ?? [];
    group.push(shift);
    byPerson.set(shift.personCode, group);
  }

  const results: ShiftOverlapResult[] = [];
  for (const [personCode, personShifts] of byPerson) {
    const issues = overlapExists(personShifts);
    if (issues.length > 0) {
      results.push({ personCode, issues });
    }
  }

  return results;
}

// ── Roster status transitions ────────────────────────────────────────

export type RosterStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export type RosterAction = 'PUBLISH' | 'CLOSE' | 'REVERT_TO_DRAFT';

export interface RosterTransitionInput {
  currentStatus: RosterStatus;
  action: RosterAction;
  checklistHasErrors: boolean;
}

export interface RosterTransitionResult {
  nextStatus: RosterStatus;
  violations: RuleViolation[];
}

/**
 * Roster state machine: DRAFT → PUBLISHED → CLOSED.
 *
 * PUBLISH requires no checklist errors (min staffing violations etc.).
 * CLOSE is only valid from PUBLISHED.
 * REVERT_TO_DRAFT goes back to DRAFT from PUBLISHED only.
 */
export function advanceRosterStatus(input: RosterTransitionInput): RosterTransitionResult {
  const violations: RuleViolation[] = [];

  if (input.action === 'PUBLISH') {
    if (input.currentStatus !== 'DRAFT') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only publish from DRAFT.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    if (input.checklistHasErrors) {
      violations.push(
        toViolation({
          code: 'CHECKLIST_NOT_GREEN',
          message: 'Cannot publish roster with unresolved staffing violations.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'PUBLISHED', violations };
  }

  if (input.action === 'CLOSE') {
    if (input.currentStatus !== 'PUBLISHED') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only close from PUBLISHED.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'CLOSED', violations };
  }

  if (input.action === 'REVERT_TO_DRAFT') {
    if (input.currentStatus !== 'PUBLISHED') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only revert to draft from PUBLISHED.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'DRAFT', violations };
  }

  return {
    nextStatus: input.currentStatus,
    violations: [
      toViolation({
        code: 'UNSUPPORTED_ACTION',
        message: 'Unsupported roster action.',
      }),
    ],
  };
}
