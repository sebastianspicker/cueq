import { BadRequestException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { RosterQueryHelper } from './roster-query.helper.js';

const ids = {
  unit: 'c00000000000000000000001',
  person: 'c00000000000000000000002',
  assignment: 'c00000000000000000000003',
  otherAssignment: 'c00000000000000000000004',
};
const periodStart = new Date('2026-08-04T00:00:00.000Z');
const periodEnd = new Date('2026-08-11T00:00:00.000Z');

function roster() {
  return {
    id: 'roster-1',
    organizationUnitId: ids.unit,
    periodStart,
    periodEnd,
    status: 'DRAFT',
    publishedAt: null,
    shifts: [],
  };
}

describe('roster effective appointment membership', () => {
  it('loads each member once through appointments effective in the roster unit and period', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const helper = new RosterQueryHelper({ person: { findMany } } as never);

    await helper.toRosterDetail(roster());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          employmentAssignments: {
            some: expect.objectContaining({
              terms: {
                some: expect.objectContaining({ organizationUnitId: ids.unit }),
              },
            }),
          },
        }),
      }),
    );
  });

  it('returns only appointments whose adjacent terms cover the requested interval in the unit', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: ids.assignment,
        label: 'Ward A',
        legacy: false,
        employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentEndDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        terms: [
          {
            id: 'term-1',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-08-04T09:00:00.000Z'),
            organizationUnitId: ids.unit,
          },
          {
            id: 'term-2',
            effectiveFrom: new Date('2026-08-04T09:00:00.000Z'),
            effectiveTo: null,
            organizationUnitId: ids.unit,
          },
        ],
      },
      {
        id: ids.otherAssignment,
        label: 'Other ward',
        legacy: false,
        employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentEndDate: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        terms: [
          {
            id: 'term-3',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
            organizationUnitId: 'c00000000000000000000005',
          },
        ],
      },
    ]);
    const helper = new RosterQueryHelper({ employmentAssignment: { findMany } } as never);

    await expect(
      helper.memberAssignmentOptions(roster(), ids.person, {
        from: '2026-08-04T08:00:00.000Z',
        to: '2026-08-04T10:00:00.000Z',
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [{ id: ids.assignment, label: 'Ward A', legacy: false, active: true }],
      nextCursor: null,
    });
  });

  it('rejects appointment lookup intervals outside the roster period', async () => {
    const findMany = vi.fn();
    const helper = new RosterQueryHelper({ employmentAssignment: { findMany } } as never);

    await expect(
      helper.memberAssignmentOptions(roster(), ids.person, {
        from: '2026-08-03T08:00:00.000Z',
        to: '2026-08-04T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
