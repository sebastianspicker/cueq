import { describe, expect, it } from 'vitest';
import { comparePlanVsActual, evaluateMinStaffing, evaluateShiftCompliance } from '..';

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
