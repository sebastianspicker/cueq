import { TimeTypeCategory } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { buildRosterPlanVsActual } from './plan-vs-actual-coverage.js';

const unitId = 'c00000000000000000000001';
const startTime = new Date('2026-08-04T08:00:00.000Z');
const endTime = new Date('2026-08-04T10:00:00.000Z');

function appointment(organizationUnitId: string) {
  return {
    employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
    employmentEndDate: null,
    terms: [
      {
        id: `term-${organizationUnitId}`,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null,
        organizationUnitId,
      },
    ],
  };
}

describe('roster plan-versus-actual appointment eligibility', () => {
  it('counts whole people only when the booking appointment is effective in the roster unit', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        personId: 'person-1',
        startTime,
        endTime,
        timeType: { category: TimeTypeCategory.WORK },
        assignment: appointment(unitId),
      },
      {
        personId: 'person-2',
        startTime,
        endTime,
        timeType: { category: TimeTypeCategory.WORK },
        assignment: appointment('c00000000000000000000002'),
      },
    ]);

    const result = await buildRosterPlanVsActual({ booking: { findMany } } as never, {
      id: 'roster-1',
      organizationUnitId: unitId,
      periodStart: startTime,
      periodEnd: endTime,
      shifts: [
        {
          id: 'shift-1',
          startTime,
          endTime,
          shiftType: 'DAY',
          minStaffing: 1,
          assignments: [],
        },
      ],
    });

    expect(result.slots[0]).toMatchObject({ actualHeadcount: 1, compliant: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignment: expect.any(Object) }),
      }),
    );
  });
});
