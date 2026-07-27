import { ForbiddenException } from '@nestjs/common';
import { Role, RosterStatus } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { RosterDomainService } from './roster-domain.service.js';

const user = (role: Role): AuthenticatedIdentity => ({
  subject: `${role.toLowerCase()}-1`,
  email: `${role.toLowerCase()}@example.invalid`,
  role,
  claims: {},
});

function roster(status: RosterStatus, organizationUnitId = 'ou-1') {
  return {
    id: 'roster-1',
    organizationUnitId,
    status,
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-31T00:00:00.000Z'),
    shifts: [],
  };
}

function serviceFor(readRoster: ReturnType<typeof roster>, actorOuId = 'ou-1') {
  const prisma = { roster: { findUnique: vi.fn().mockResolvedValue(readRoster) } };
  const personHelper = {
    personForUser: vi.fn().mockResolvedValue({ id: 'actor-1', organizationUnitId: actorOuId }),
  };
  const queryHelper = {
    toRosterDetail: vi.fn().mockReturnValue(readRoster),
    buildPlanVsActualForRoster: vi.fn().mockResolvedValue({}),
  };
  const service = new RosterDomainService(
    prisma as never,
    personHelper as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    queryHelper as never,
  );
  return { service, queryHelper };
}

describe('RosterDomainService read scopes', () => {
  it('allows a team lead to read published roster detail and plan-vs-actual', async () => {
    const { service } = serviceFor(roster(RosterStatus.PUBLISHED));

    await expect(service.rosterById(user(Role.TEAM_LEAD), 'roster-1')).resolves.toMatchObject({
      id: 'roster-1',
    });
    await expect(
      service.rosterPlanVsActual(user(Role.TEAM_LEAD), 'roster-1'),
    ).resolves.toMatchObject({ rosterId: 'roster-1' });
  });

  it('rejects team-lead reads of a same-OU draft roster', async () => {
    const { service } = serviceFor(roster(RosterStatus.DRAFT));

    await expect(service.rosterById(user(Role.TEAM_LEAD), 'roster-1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.rosterPlanVsActual(user(Role.TEAM_LEAD), 'roster-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a shift planner to read a same-OU draft roster', async () => {
    const { service } = serviceFor(roster(RosterStatus.DRAFT));

    await expect(service.rosterById(user(Role.SHIFT_PLANNER), 'roster-1')).resolves.toMatchObject({
      id: 'roster-1',
    });
  });

  it.each([Role.HR, Role.ADMIN])('allows %s to read a cross-OU draft roster', async (role) => {
    const { service } = serviceFor(roster(RosterStatus.DRAFT, 'ou-2'));

    await expect(service.rosterById(user(role), 'roster-1')).resolves.toMatchObject({
      id: 'roster-1',
    });
  });
});
