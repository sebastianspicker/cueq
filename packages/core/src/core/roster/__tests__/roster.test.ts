import { describe, expect, it } from 'vitest';
import {
  comparePlanVsActual,
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

    expect(result.slots[0]?.actualHeadcount).toBe(1);
    expect(result.mismatchedSlots).toBe(0);
    expect(result.coverageRate).toBe(1);
  });
});
