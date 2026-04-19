import { describe, expect, it } from 'vitest';
import {
  advanceRosterStatus,
  comparePlanVsActual,
  detectShiftOverlaps,
  evaluateMinStaffing,
  evaluatePlanVsActualCoverage,
  evaluateShiftCompliance,
} from '..';

describe('evaluateShiftCompliance', () => {
  it('detects impossible shift intervals', () => {
    const result = evaluateShiftCompliance({
      shift: {
        type: 'NIGHT',
        start: '2026-03-09T06:00:00.000Z',
        end: '2026-03-09T06:00:00.000Z',
      },
      recordedBreakMinutes: 15,
    });

    expect(result.violations[0]?.code).toBe('INVALID_SHIFT_INTERVAL');
  });

  it('flags break deficit and rest deficits', () => {
    const result = evaluateShiftCompliance({
      shift: {
        type: 'NIGHT',
        start: '2026-03-10T22:00:00.000Z',
        end: '2026-03-11T06:00:00.000Z',
      },
      recordedBreakMinutes: 15,
      previousShiftEnd: '2026-03-10T14:30:00.000Z',
    });

    expect(result.violations.some((violation) => violation.code === 'BREAK_DEFICIT')).toBe(true);
    expect(result.violations.some((violation) => violation.code === 'REST_HOURS_DEFICIT')).toBe(
      true,
    );
  });

  it('detects rest period violation on EARLY→LATE same-day transition', () => {
    // EARLY ends 14:00, LATE starts 22:00 → only 8h rest, below 11h minimum
    const result = evaluateShiftCompliance({
      shift: {
        type: 'LATE',
        start: '2026-03-10T22:00:00.000Z',
        end: '2026-03-11T06:00:00.000Z',
      },
      recordedBreakMinutes: 45,
      previousShiftEnd: '2026-03-10T14:00:00.000Z',
    });

    expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(true);
    expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
  });

  it('passes rest check when EARLY→LATE transition has sufficient gap', () => {
    // EARLY ends 06:00, LATE starts 22:00 → 16h rest, above 11h minimum
    const result = evaluateShiftCompliance({
      shift: {
        type: 'LATE',
        start: '2026-03-10T22:00:00.000Z',
        end: '2026-03-11T06:00:00.000Z',
      },
      recordedBreakMinutes: 45,
      previousShiftEnd: '2026-03-10T06:00:00.000Z',
    });

    expect(result.violations).toHaveLength(0);
  });
});

describe('evaluateMinStaffing', () => {
  it('returns shortfall when assignment is below required minimum', () => {
    const result = evaluateMinStaffing({
      requiredMinStaffing: 3,
      assignedCount: 2,
    });

    expect(result.compliant).toBe(false);
    expect(result.shortfall).toBe(1);
  });

  it('reports maximum shortfall when zero persons are assigned', () => {
    const result = evaluateMinStaffing({
      requiredMinStaffing: 3,
      assignedCount: 0,
    });

    expect(result.compliant).toBe(false);
    expect(result.shortfall).toBe(3);
  });

  it('is compliant when assigned count equals required minimum', () => {
    const result = evaluateMinStaffing({
      requiredMinStaffing: 3,
      assignedCount: 3,
    });

    expect(result.compliant).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it('is compliant with zero shortfall when above minimum', () => {
    const result = evaluateMinStaffing({
      requiredMinStaffing: 2,
      assignedCount: 5,
    });

    expect(result.compliant).toBe(true);
    expect(result.shortfall).toBe(0);
  });
});

describe('detectShiftOverlaps', () => {
  it('detects overlapping shifts for the same person', () => {
    const results = detectShiftOverlaps([
      {
        personCode: 'p1',
        start: '2026-03-10T06:00:00.000Z',
        end: '2026-03-10T14:00:00.000Z',
      },
      {
        personCode: 'p1',
        start: '2026-03-10T13:00:00.000Z',
        end: '2026-03-10T21:00:00.000Z',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.personCode).toBe('p1');
    expect(results[0]?.issues[0]?.code).toBe('OVERLAP');
  });

  it('returns empty when shifts do not overlap', () => {
    const results = detectShiftOverlaps([
      {
        personCode: 'p1',
        start: '2026-03-10T06:00:00.000Z',
        end: '2026-03-10T14:00:00.000Z',
      },
      {
        personCode: 'p1',
        start: '2026-03-10T14:00:00.000Z',
        end: '2026-03-10T22:00:00.000Z',
      },
    ]);

    expect(results).toHaveLength(0);
  });

  it('isolates overlaps per person (different persons can share time slots)', () => {
    const results = detectShiftOverlaps([
      {
        personCode: 'p1',
        start: '2026-03-10T08:00:00.000Z',
        end: '2026-03-10T16:00:00.000Z',
      },
      {
        personCode: 'p2',
        start: '2026-03-10T08:00:00.000Z',
        end: '2026-03-10T16:00:00.000Z',
      },
    ]);

    expect(results).toHaveLength(0);
  });
});

describe('comparePlanVsActual', () => {
  it('computes mismatch rate across slots', () => {
    const result = comparePlanVsActual([
      {
        slotId: 'slot-1',
        plannedHeadcount: 2,
        actualHeadcount: 2,
      },
      {
        slotId: 'slot-2',
        plannedHeadcount: 2,
        actualHeadcount: 1,
      },
    ]);

    expect(result.totalSlots).toBe(2);
    expect(result.mismatchedSlots).toBe(1);
    expect(result.complianceRate).toBe(0.5);
  });

  it('returns full compliance for empty slot lists', () => {
    const result = comparePlanVsActual([]);

    expect(result.totalSlots).toBe(0);
    expect(result.mismatchedSlots).toBe(0);
    expect(result.complianceRate).toBe(1);
  });
});

describe('evaluatePlanVsActualCoverage', () => {
  it('derives planned coverage from max(minStaffing, assignments)', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 2,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:30:00.000Z',
          endTime: '2026-03-10T15:30:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
    );

    expect(result.totalSlots).toBe(1);
    expect(result.mismatchedSlots).toBe(1);
    expect(result.understaffedSlots).toBe(1);
    expect(result.slots[0]?.plannedHeadcount).toBe(2);
    expect(result.slots[0]?.actualHeadcount).toBe(1);
    expect(result.slots[0]?.delta).toBe(-1);
    expect(result.slots[0]?.compliant).toBe(false);
  });

  it('counts overlapping bookings by unique person only', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-2',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T12:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'p1',
          startTime: '2026-03-10T12:30:00.000Z',
          endTime: '2026-03-10T15:00:00.000Z',
          timeTypeCategory: 'DEPLOYMENT',
        },
      ],
    );

    expect(result.slots[0]?.actualHeadcount).toBe(1);
    expect(result.mismatchedSlots).toBe(0);
  });

  it('requires meaningful coverage rather than any tiny overlap', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-short-overlap',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T15:45:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
    );

    expect(result.slots[0]?.actualHeadcount).toBe(0);
    expect(result.understaffedSlots).toBe(1);
  });

  it('counts split bookings when their combined coverage is meaningful', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-split-coverage',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T10:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'p1',
          startTime: '2026-03-10T11:00:00.000Z',
          endTime: '2026-03-10T13:30:00.000Z',
          timeTypeCategory: 'DEPLOYMENT',
        },
      ],
    );

    expect(result.slots[0]?.actualHeadcount).toBe(1);
    expect(result.mismatchedSlots).toBe(0);
  });

  it('treats boundary-touching intervals as non-overlapping', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-3',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T06:00:00.000Z',
          endTime: '2026-03-10T08:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'p2',
          startTime: '2026-03-10T16:00:00.000Z',
          endTime: '2026-03-10T18:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
    );

    expect(result.slots[0]?.actualHeadcount).toBe(0);
    expect(result.understaffedSlots).toBe(1);
  });

  it('handles cross-midnight overlap and filters non-work categories', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-4',
          startTime: '2026-03-10T22:00:00.000Z',
          endTime: '2026-03-11T06:00:00.000Z',
          shiftType: 'NIGHT',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T23:00:00.000Z',
          endTime: '2026-03-11T01:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'p2',
          startTime: '2026-03-10T23:30:00.000Z',
          endTime: '2026-03-11T00:30:00.000Z',
          timeTypeCategory: 'PAUSE',
        },
      ],
    );

    expect(result.slots[0]?.actualHeadcount).toBe(0);
    expect(result.mismatchedSlots).toBe(1);
    expect(result.coverageRate).toBe(0);
  });

  it('reports zero actual headcount when no bookings exist for a shift', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-empty',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 2,
          assignedPersonIds: ['p1', 'p2'],
        },
      ],
      [],
    );

    expect(result.totalSlots).toBe(1);
    expect(result.slots[0]?.actualHeadcount).toBe(0);
    expect(result.slots[0]?.plannedHeadcount).toBe(2);
    expect(result.slots[0]?.delta).toBe(-2);
    expect(result.slots[0]?.compliant).toBe(false);
    expect(result.understaffedSlots).toBe(1);
    expect(result.complianceRate).toBe(0);
    expect(result.coverageRate).toBe(0);
  });

  it('exposes plannedDurationMinutes and actualCoveredMinutes per slot', () => {
    // 8h shift; p1 covers 4h → exactly 50% (meets default 0.5 threshold)
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-duration',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T12:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
    );

    expect(result.slots[0]?.plannedDurationMinutes).toBe(480);
    expect(result.slots[0]?.actualCoveredMinutes).toBe(240);
    expect(result.slots[0]?.actualHeadcount).toBe(1);
    expect(result.slots[0]?.durationCoverageRatio).toBeGreaterThan(0);
  });

  it('configurable coverageThreshold: 75% threshold rejects person with only 60% coverage', () => {
    // 8h shift; p1 covers 4.5h (56.25%) → above default 50% but below 75%
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'shift-threshold',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T12:30:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
      { coverageThreshold: 0.75 },
    );

    // With 75% threshold (360 min required), 270 min covered is insufficient
    expect(result.slots[0]?.actualHeadcount).toBe(0);
    expect(result.understaffedSlots).toBe(1);
  });

  it('durationCoverageRate aggregates actual vs planned minutes across all slots', () => {
    // Two 4h shifts; p1 fully covers slot-1, nobody covers slot-2
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'slot-a',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T12:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p1'],
        },
        {
          shiftId: 'slot-b',
          startTime: '2026-03-10T12:00:00.000Z',
          endTime: '2026-03-10T16:00:00.000Z',
          shiftType: 'EARLY',
          minStaffing: 1,
          assignedPersonIds: ['p2'],
        },
      ],
      [
        {
          personId: 'p1',
          startTime: '2026-03-10T08:00:00.000Z',
          endTime: '2026-03-10T12:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
    );

    // slot-a: 240 planned, 240 actual; slot-b: 240 planned, 0 actual → 50%
    expect(result.durationCoverageRate).toBe(0.5);
    expect(result.coverageRate).toBe(0.5);
  });
});

describe('advanceRosterStatus', () => {
  it('follows DRAFT → PUBLISHED → CLOSED happy path', () => {
    const step1 = advanceRosterStatus({
      currentStatus: 'DRAFT',
      action: 'PUBLISH',
      checklistHasErrors: false,
    });
    expect(step1.nextStatus).toBe('PUBLISHED');
    expect(step1.violations).toHaveLength(0);

    const step2 = advanceRosterStatus({
      currentStatus: 'PUBLISHED',
      action: 'CLOSE',
      checklistHasErrors: false,
    });
    expect(step2.nextStatus).toBe('CLOSED');
    expect(step2.violations).toHaveLength(0);
  });

  it('blocks publish when checklist has errors', () => {
    const result = advanceRosterStatus({
      currentStatus: 'DRAFT',
      action: 'PUBLISH',
      checklistHasErrors: true,
    });

    expect(result.nextStatus).toBe('DRAFT');
    expect(result.violations[0]?.code).toBe('CHECKLIST_NOT_GREEN');
  });

  it('rejects publish from non-DRAFT status', () => {
    const result = advanceRosterStatus({
      currentStatus: 'PUBLISHED',
      action: 'PUBLISH',
      checklistHasErrors: false,
    });

    expect(result.nextStatus).toBe('PUBLISHED');
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });

  it('rejects close from DRAFT status', () => {
    const result = advanceRosterStatus({
      currentStatus: 'DRAFT',
      action: 'CLOSE',
      checklistHasErrors: false,
    });

    expect(result.nextStatus).toBe('DRAFT');
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });

  it('allows revert to draft from PUBLISHED only', () => {
    const revert = advanceRosterStatus({
      currentStatus: 'PUBLISHED',
      action: 'REVERT_TO_DRAFT',
      checklistHasErrors: false,
    });
    expect(revert.nextStatus).toBe('DRAFT');
    expect(revert.violations).toHaveLength(0);

    const revertFromClosed = advanceRosterStatus({
      currentStatus: 'CLOSED',
      action: 'REVERT_TO_DRAFT',
      checklistHasErrors: false,
    });
    expect(revertFromClosed.nextStatus).toBe('CLOSED');
    expect(revertFromClosed.violations[0]?.code).toBe('INVALID_TRANSITION');
  });
});
