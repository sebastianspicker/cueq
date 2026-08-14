import { ClosingLockSource, ClosingStatus, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { ClosingDomainService } from './closing-domain.service.js';

const ORGANIZATION_UNIT_ID = 'clorg00000000000000000001';

function user(role: Role): AuthenticatedIdentity {
  return {
    subject: `${role.toLowerCase()}-user`,
    email: `${role.toLowerCase()}@example.invalid`,
    role,
    claims: {},
  };
}

function closingPeriod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'closing-period-1',
    organizationUnitId: ORGANIZATION_UNIT_ID,
    periodStart: new Date('2026-03-01T00:00:00.000Z'),
    periodEnd: new Date('2026-03-31T23:59:59.999Z'),
    status: ClosingStatus.CLOSED,
    exportRuns: [{ id: 'export-latest', exportedAt: new Date('2026-04-01T08:00:00.000Z') }],
    closedAt: new Date('2026-04-01T00:00:00.000Z'),
    closedById: 'hr-1',
    leadApprovedAt: new Date('2026-03-31T12:00:00.000Z'),
    leadApprovedById: 'lead-1',
    hrApprovedAt: new Date('2026-04-01T00:00:00.000Z'),
    hrApprovedById: 'hr-1',
    lockedAt: new Date('2026-03-31T12:00:00.000Z'),
    lockSource: 'MANUAL_REVIEW_START',
    createdAt: new Date('2026-02-15T10:00:00.000Z'),
    updatedAt: new Date('2026-04-01T08:00:00.000Z'),
    ...overrides,
  };
}

function readService(options: {
  actorOrganizationUnitId?: string;
  findMany?: unknown[];
  findUnique?: unknown | null;
} = {}) {
  const prisma = {
    closingPeriod: {
      findMany: vi.fn().mockResolvedValue(options.findMany ?? []),
      findUnique: vi
        .fn()
        .mockResolvedValue('findUnique' in options ? options.findUnique : closingPeriod()),
    },
  };
  const personHelper = {
    personForUser: vi
      .fn()
      .mockResolvedValue({ id: 'actor-1', organizationUnitId: options.actorOrganizationUnitId ?? ORGANIZATION_UNIT_ID }),
  };
  const service = new ClosingDomainService(
    prisma as never,
    personHelper as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { personHelper, prisma, service };
}

async function withEnvironment<T>(
  values: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const original = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function openPeriod(id: string, periodEnd: string) {
  return {
    id,
    status: ClosingStatus.OPEN,
    organizationUnitId: null,
    periodStart: new Date(`${periodEnd.slice(0, 7)}-01T00:00:00.000Z`),
    periodEnd: new Date(periodEnd),
  };
}

describe('ClosingDomainService automatic cutoff resilience', () => {
  it('continues with later periods when one period lock is busy', async () => {
    const periods = ['closing-busy', 'closing-ready'].map((id) => ({
      id,
      status: ClosingStatus.OPEN,
      organizationUnitId: null,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
    }));
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ acquired: false }])
        .mockResolvedValueOnce([{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn().mockResolvedValue(periods[1]),
        update: vi.fn().mockResolvedValue({}),
      },
      auditEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue(periods) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z'))).resolves.toEqual({
      enabled: true,
      evaluated: 2,
      transitioned: 1,
      busy: 1,
    });
    expect(tx.closingPeriod.update).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledTimes(1);
  });

  it('does not transition a due period without a durable audit actor', async () => {
    const period = {
      id: 'closing-due',
      status: ClosingStatus.OPEN,
      organizationUnitId: null,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([period]) },
      $transaction: vi.fn(),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue(null),
      appendAudit: vi.fn(),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z')),
    ).rejects.toMatchObject({
      response: { code: 'CLOSING_SYSTEM_ACTOR_UNAVAILABLE' },
      status: 503,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });
});

describe('ClosingDomainService automatic cutoff contracts', () => {
  it('returns the exact disabled result without querying Prisma or resolving an audit actor', async () => {
    const prisma = {
      closingPeriod: { findMany: vi.fn() },
      $transaction: vi.fn(),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn(),
      appendAudit: vi.fn(),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await withEnvironment({ CLOSING_AUTO_CUTOFF_ENABLED: 'false' }, async () => {
      await expect(service.runClosingCutoff()).resolves.toEqual({
        enabled: false,
        evaluated: 0,
        transitioned: 0,
        busy: 0,
      });
    });

    expect(prisma.closingPeriod.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditHelper.resolveSystemActorId).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('queries ordered OPEN periods, filters by the cutoff at now, and resolves the actor only after the query', async () => {
    const duePeriod = openPeriod('closing-due', '2026-05-31T23:59:59.999Z');
    const futurePeriod = openPeriod('closing-future', '2026-07-31T23:59:59.999Z');
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn().mockResolvedValue(duePeriod),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([duePeriod, futurePeriod]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const now = new Date('2026-07-14T12:00:00.000Z');

    await expect(service.runClosingCutoff(now)).resolves.toEqual({
      enabled: true,
      evaluated: 2,
      transitioned: 1,
      busy: 0,
    });

    expect(prisma.closingPeriod.findMany).toHaveBeenCalledWith({
      where: { status: ClosingStatus.OPEN },
      select: { id: true, periodStart: true, periodEnd: true, organizationUnitId: true },
      orderBy: { periodStart: 'asc' },
    });
    expect(auditHelper.resolveSystemActorId.mock.invocationCallOrder[0]!).toBeGreaterThan(
      prisma.closingPeriod.findMany.mock.invocationCallOrder[0]!,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.closingPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: duePeriod.id } }),
    );
  });

  it('runs due periods sequentially and preserves the lock, reread, update, and audit transaction sequence', async () => {
    const firstPeriod = openPeriod('closing-first', '2026-05-31T23:59:59.999Z');
    const secondPeriod = openPeriod('closing-second', '2026-06-30T23:59:59.999Z');
    const events: string[] = [];
    let activeTransactions = 0;
    let peakTransactions = 0;
    const tx = {
      $queryRaw: vi.fn(async () => {
        events.push('lock');
        return [{ acquired: true }];
      }),
      closingPeriod: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`reread:${where.id}`);
          return where.id === firstPeriod.id ? firstPeriod : secondPeriod;
        }),
        update: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`update:${where.id}`);
          return {};
        }),
      },
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([firstPeriod, secondPeriod]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
        activeTransactions += 1;
        peakTransactions = Math.max(peakTransactions, activeTransactions);
        events.push('transaction:start');
        try {
          return await callback(tx);
        } finally {
          events.push('transaction:end');
          activeTransactions -= 1;
        }
      }),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn(async ({ entityId }: { entityId: string }) => {
        events.push(`audit:${entityId}`);
      }),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const now = new Date('2026-07-14T12:00:00.000Z');

    await withEnvironment(
      { CLOSING_TIMEZONE: 'UTC', CLOSING_CUTOFF_DAY: '3', CLOSING_CUTOFF_HOUR: '12' },
      async () => {
        await expect(service.runClosingCutoff(now)).resolves.toEqual({
          enabled: true,
          evaluated: 2,
          transitioned: 2,
          busy: 0,
        });
      },
    );

    expect(peakTransactions).toBe(1);
    expect(events).toEqual([
      'transaction:start',
      'lock',
      'reread:closing-first',
      'update:closing-first',
      'audit:closing-first',
      'transaction:end',
      'transaction:start',
      'lock',
      'reread:closing-second',
      'update:closing-second',
      'audit:closing-second',
      'transaction:end',
    ]);
    expect(tx.closingPeriod.update).toHaveBeenNthCalledWith(1, {
      where: { id: firstPeriod.id },
      data: {
        status: ClosingStatus.REVIEW,
        lockedAt: now,
        lockSource: ClosingLockSource.AUTO_CUTOFF,
      },
    });
    expect(auditHelper.appendAudit).toHaveBeenNthCalledWith(
      1,
      {
        actorId: 'system-actor',
        action: 'CLOSING_CUTOFF_APPLIED',
        entityType: 'ClosingPeriod',
        entityId: firstPeriod.id,
        before: { status: 'OPEN' },
        after: {
          status: 'REVIEW',
          lockedAt: now.toISOString(),
          lockSource: 'AUTO_CUTOFF',
          cutoffAt: '2026-06-03T12:00:00.000Z',
        },
      },
      tx,
    );
  });

  it('does not update or audit when the transaction reread is no longer OPEN', async () => {
    const duePeriod = openPeriod('closing-stale', '2026-05-31T23:59:59.999Z');
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn().mockResolvedValue({ ...duePeriod, status: ClosingStatus.REVIEW }),
        update: vi.fn(),
      },
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([duePeriod]) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn(),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z'))).resolves.toEqual({
      enabled: true,
      evaluated: 1,
      transitioned: 0,
      busy: 0,
    });

    expect(tx.closingPeriod.findUnique).toHaveBeenCalledWith({ where: { id: duePeriod.id } });
    expect(tx.closingPeriod.update).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('propagates a non-busy transaction error and stops without processing later due periods', async () => {
    const firstPeriod = openPeriod('closing-error', '2026-05-31T23:59:59.999Z');
    const secondPeriod = openPeriod('closing-later', '2026-06-30T23:59:59.999Z');
    const failure = new Error('database unavailable');
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([firstPeriod, secondPeriod]) },
      $transaction: vi.fn().mockRejectedValue(failure),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn(),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z'))).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });
});

describe('ClosingDomainService closing-period read contracts', () => {
  it('denies an employee before issuing a closing-period Prisma read', async () => {
    const { personHelper, prisma, service } = readService();
    const employee = user(Role.EMPLOYEE);

    await expect(service.listClosingPeriods(employee)).rejects.toThrow(
      'Role does not permit reading closing periods.',
    );

    expect(personHelper.personForUser).toHaveBeenCalledWith(employee);
    expect(prisma.closingPeriod.findMany).not.toHaveBeenCalled();
    expect(prisma.closingPeriod.findUnique).not.toHaveBeenCalled();
  });

  it('denies a team lead explicit cross-OU list request before issuing a Prisma read', async () => {
    const { personHelper, prisma, service } = readService();
    const teamLead = user(Role.TEAM_LEAD);

    await expect(
      service.listClosingPeriods(teamLead, undefined, undefined, 'clorg00000000000000000002'),
    ).rejects.toThrow('Team leads can only access closing periods in their own unit.');

    expect(personHelper.personForUser).toHaveBeenCalledWith(teamLead);
    expect(prisma.closingPeriod.findMany).not.toHaveBeenCalled();
  });

  it('scopes an implicit team-lead list to its own OU and maps the stable period response', async () => {
    const period = closingPeriod();
    const { personHelper, prisma, service } = readService({ findMany: [period] });
    const teamLead = user(Role.TEAM_LEAD);

    await expect(service.listClosingPeriods(teamLead, '2026-03', '2026-03')).resolves.toEqual([
      {
        id: 'closing-period-1',
        organizationUnitId: ORGANIZATION_UNIT_ID,
        periodStart: '2026-03-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
        status: 'APPROVED',
        exportRuns: [{ id: 'export-latest', exportedAt: new Date('2026-04-01T08:00:00.000Z') }],
        closedAt: '2026-04-01T00:00:00.000Z',
        closedById: 'hr-1',
        leadApprovedAt: '2026-03-31T12:00:00.000Z',
        leadApprovedById: 'lead-1',
        hrApprovedAt: '2026-04-01T00:00:00.000Z',
        hrApprovedById: 'hr-1',
        lockedAt: '2026-03-31T12:00:00.000Z',
        lockSource: 'MANUAL_REVIEW_START',
        createdAt: '2026-02-15T10:00:00.000Z',
        updatedAt: '2026-04-01T08:00:00.000Z',
      },
    ]);

    expect(prisma.closingPeriod.findMany).toHaveBeenCalledWith({
      where: {
        organizationUnitId: ORGANIZATION_UNIT_ID,
        periodStart: { lte: new Date('2026-03-31T23:59:59.000Z') },
        periodEnd: { gte: new Date('2026-03-01T00:00:00.000Z') },
      },
      include: {
        exportRuns: {
          orderBy: { exportedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { periodStart: 'desc' },
    });
    expect(personHelper.personForUser.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.closingPeriod.findMany.mock.invocationCallOrder[0]!,
    );
  });

  it('checks detail read roles before looking up a closing period', async () => {
    const { personHelper, prisma, service } = readService();
    const employee = user(Role.EMPLOYEE);

    await expect(service.getClosingPeriod(employee, 'closing-period-1')).rejects.toThrow(
      'Role does not permit reading closing periods.',
    );

    expect(personHelper.personForUser).toHaveBeenCalledWith(employee);
    expect(prisma.closingPeriod.findUnique).not.toHaveBeenCalled();
  });

  it('reports a missing closing period after the authorized detail lookup', async () => {
    const { personHelper, prisma, service } = readService({ findUnique: null });
    const hr = user(Role.HR);

    await expect(service.getClosingPeriod(hr, 'missing-period')).rejects.toThrow(
      'Closing period not found.',
    );

    expect(prisma.closingPeriod.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-period' },
      include: { exportRuns: { orderBy: { exportedAt: 'desc' } } },
    });
    expect(personHelper.personForUser.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.closingPeriod.findUnique.mock.invocationCallOrder[0]!,
    );
  });

  it('denies a team lead detail from another OU after the lookup', async () => {
    const { personHelper, prisma, service } = readService({
      actorOrganizationUnitId: 'clorg00000000000000000002',
      findUnique: closingPeriod(),
    });
    const teamLead = user(Role.TEAM_LEAD);

    await expect(service.getClosingPeriod(teamLead, 'closing-period-1')).rejects.toThrow(
      'Team leads can only access closing periods in their own unit.',
    );

    expect(prisma.closingPeriod.findUnique).toHaveBeenCalledOnce();
    expect(personHelper.personForUser.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.closingPeriod.findUnique.mock.invocationCallOrder[0]!,
    );
  });

  it.each([Role.HR, Role.ADMIN])('%s can read a cross-OU detail with the stable mapped response', async (role) => {
    const period = closingPeriod({ organizationUnitId: 'clorg00000000000000000002' });
    const { prisma, service } = readService({
      actorOrganizationUnitId: ORGANIZATION_UNIT_ID,
      findUnique: period,
    });

    await expect(service.getClosingPeriod(user(role), 'closing-period-1')).resolves.toMatchObject({
      id: 'closing-period-1',
      organizationUnitId: 'clorg00000000000000000002',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.999Z',
      status: 'APPROVED',
      exportRuns: [{ id: 'export-latest', exportedAt: new Date('2026-04-01T08:00:00.000Z') }],
      closedAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T08:00:00.000Z',
    });

    expect(prisma.closingPeriod.findUnique).toHaveBeenCalledWith({
      where: { id: 'closing-period-1' },
      include: { exportRuns: { orderBy: { exportedAt: 'desc' } } },
    });
  });
});
