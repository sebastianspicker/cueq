import { AbsenceStatus, AbsenceType, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { AbsenceDomainService } from './absence-domain.service.js';

const ORGANIZATION_UNIT_ID = 'cm0000000000000000000001';
const PERSON_ID = 'cm0000000000000000000002';

function user(role: Role): AuthenticatedIdentity {
  return {
    subject: PERSON_ID,
    email: 'viewer@example.invalid',
    role,
    claims: {},
  };
}

function fixture(status: AbsenceStatus) {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: 'cm0000000000000000000003',
      personId: PERSON_ID,
      type: AbsenceType.SICK,
      startDate: new Date('2026-07-20T00:00:00.000Z'),
      endDate: new Date('2026-07-21T00:00:00.000Z'),
      status,
      note: 'Medical detail',
      person: {
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    },
  ]);
  const service = new AbsenceDomainService(
    { absence: { findMany } } as never,
    {
      personForUser: vi.fn().mockResolvedValue({
        id: PERSON_ID,
        organizationUnitId: ORGANIZATION_UNIT_ID,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, findMany };
}

describe('AbsenceDomainService team calendar privacy', () => {
  it.each([Role.EMPLOYEE, Role.SHIFT_PLANNER, Role.ADMIN])(
    'limits %s to approved absences and redacts absence details',
    async (role) => {
      const { service, findMany } = fixture(AbsenceStatus.APPROVED);

      const entries = await service.teamCalendar(user(role), '2026-07-01', '2026-07-31');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            person: { organizationUnitId: ORGANIZATION_UNIT_ID },
            status: { in: [AbsenceStatus.APPROVED] },
          }),
        }),
      );
      expect(entries[0]).not.toHaveProperty('type');
      expect(entries[0]).not.toHaveProperty('note');
      expect(entries[0]).toMatchObject({
        personName: 'Ada Lovelace',
        visibilityStatus: 'ABSENT',
      });
    },
  );

  it.each([Role.TEAM_LEAD, Role.HR])(
    'allows %s to see requested absences and operational details in their own unit',
    async (role) => {
      const { service, findMany } = fixture(AbsenceStatus.REQUESTED);

      const entries = await service.teamCalendar(user(role), '2026-07-01', '2026-07-31');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            person: { organizationUnitId: ORGANIZATION_UNIT_ID },
            status: {
              in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED],
            },
          }),
        }),
      );
      expect(entries[0]).toMatchObject({
        type: AbsenceType.SICK,
        note: 'Medical detail',
      });
    },
  );
});
