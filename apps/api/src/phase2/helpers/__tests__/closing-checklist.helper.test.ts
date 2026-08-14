import { describe, expect, it, vi } from 'vitest';
import { ClosingStatus, Role, TimeTypeCategory } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../../common/auth/auth.types.js';
import { ClosingChecklistHelper } from '../closing-checklist.helper.js';

const ADMIN_USER: AuthenticatedIdentity = {
  subject: 'admin-user',
  email: 'admin@example.com',
  role: Role.ADMIN,
  claims: {},
};

const PERIOD = {
  id: 'closing-1',
  status: ClosingStatus.OPEN,
  organizationUnitId: 'unit-1',
  periodStart: new Date('2026-03-01T00:00:00.000Z'),
  periodEnd: new Date('2026-03-31T23:59:59.999Z'),
  exportRuns: [],
};

type ChecklistTestPeriod = Omit<typeof PERIOD, 'organizationUnitId'> & {
  organizationUnitId: string | null;
};

function booking(
  start: string,
  end: string | null,
  category: TimeTypeCategory,
  personId = 'person-1',
  organizationUnitId = 'unit-1',
) {
  return {
    personId,
    startTime: new Date(start),
    endTime: end ? new Date(end) : null,
    timeType: { category },
    person: { organizationUnitId },
  };
}

function makeHelper(
  bookings: ReturnType<typeof booking>[],
  options: {
    actorOrganizationUnitId?: string;
    people?: Array<{ id: string }>;
    period?: ChecklistTestPeriod | null;
    rosters?: Array<{
      id: string;
      organizationUnitId: string;
      periodStart: Date;
      periodEnd: Date;
      shifts: Array<{
        id: string;
        personId: string | null;
        startTime: Date;
        endTime: Date;
        shiftType: string;
        minStaffing: number;
        assignments: Array<{ personId: string }>;
      }>;
    }>;
  } = {},
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    closingPeriod: {
      findUnique: vi.fn().mockResolvedValue(options.period === undefined ? PERIOD : options.period),
    },
    person: { findMany: vi.fn().mockResolvedValue(options.people ?? [{ id: 'person-1' }]) },
    booking: { findMany: vi.fn().mockResolvedValue(bookings) },
    absence: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    workflowInstance: { count: vi.fn().mockResolvedValue(0) },
    roster: { findMany: vi.fn().mockResolvedValue(options.rosters ?? []) },
    timeAccount: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const eventOutboxHelper = {
    enqueueDomainEvent: vi.fn().mockResolvedValue(undefined),
  };
  const personHelper = {
    personForUser: vi
      .fn()
      .mockResolvedValue({ organizationUnitId: options.actorOrganizationUnitId ?? 'unit-1' }),
  };
  const timeThresholdPolicyHelper = {
    getActiveThresholds: vi.fn().mockResolvedValue({
      dailyMaxMinutes: 600,
      minRestMinutes: 660,
    }),
  };
  const helper = new ClosingChecklistHelper(
    prisma as never,
    personHelper as never,
    eventOutboxHelper as never,
    timeThresholdPolicyHelper as never,
  );
  return { eventOutboxHelper, helper, personHelper, prisma, timeThresholdPolicyHelper, tx };
}

describe('ClosingChecklistHelper', () => {
  it('resolves the actor before denying an unauthorized checklist read', async () => {
    const { eventOutboxHelper, helper, personHelper, prisma, tx } = makeHelper([]);
    const unauthorizedUser = { ...ADMIN_USER, role: Role.EMPLOYEE };

    await expect(helper.closingChecklist(unauthorizedUser, PERIOD.id)).rejects.toThrow(
      'Role does not permit reading closing checklist details.',
    );

    expect(personHelper.personForUser).toHaveBeenCalledWith(unauthorizedUser);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('locks the root transaction before reporting a missing closing period', async () => {
    const { eventOutboxHelper, helper, timeThresholdPolicyHelper, tx } = makeHelper([], {
      period: null,
    });

    await expect(helper.closingChecklist(ADMIN_USER, PERIOD.id)).rejects.toThrow(
      'Closing period not found.',
    );

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.closingPeriod.findUnique).toHaveBeenCalledOnce();
    expect(timeThresholdPolicyHelper.getActiveThresholds).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('denies a cross-unit team lead after the period lookup and before metrics', async () => {
    const { eventOutboxHelper, helper, timeThresholdPolicyHelper, tx } = makeHelper([], {
      actorOrganizationUnitId: 'unit-2',
    });
    const teamLead = { ...ADMIN_USER, role: Role.TEAM_LEAD };

    await expect(helper.closingChecklist(teamLead, PERIOD.id)).rejects.toThrow(
      'Team leads can only access closing checklist in their own unit.',
    );

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.closingPeriod.findUnique).toHaveBeenCalledOnce();
    expect(timeThresholdPolicyHelper.getActiveThresholds).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('blocks an open booking and does not accept it as clean coverage', async () => {
    const { helper } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', null, TimeTypeCategory.WORK),
    ]);

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.hasErrors).toBe(true);
    expect(checklist.items.find((item) => item.code === 'MISSING_BOOKINGS')).toMatchObject({
      status: 'OPEN',
      severity: 'ERROR',
    });
    expect(checklist.items.find((item) => item.code === 'RULE_VIOLATIONS')).toMatchObject({
      status: 'OPEN',
      severity: 'ERROR',
    });
  });

  it('writes violation events through the locked checklist transaction', async () => {
    const { eventOutboxHelper, helper, tx } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', null, TimeTypeCategory.WORK),
    ]);

    await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'violation.detected',
        aggregateId: PERIOD.id,
      }),
      tx,
    );
  });

  it('does not open a nested transaction or relock when given a transaction client', async () => {
    const { helper, prisma, tx } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', null, TimeTypeCategory.WORK),
    ]);

    await helper.closingChecklist(ADMIN_USER, PERIOD.id, tx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('fetches thresholds before booking and absence queries', async () => {
    const { helper, timeThresholdPolicyHelper, tx } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', '2026-03-02T16:00:00.000Z', TimeTypeCategory.WORK),
    ]);

    await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(timeThresholdPolicyHelper.getActiveThresholds.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.booking.findMany.mock.invocationCallOrder[0]!,
    );
    expect(timeThresholdPolicyHelper.getActiveThresholds.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.absence.findMany.mock.invocationCallOrder[0]!,
    );
  });

  it('does not emit a violation event for an error-free checklist', async () => {
    const { eventOutboxHelper, helper } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', '2026-03-02T12:00:00.000Z', TimeTypeCategory.WORK),
    ]);

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.hasErrors).toBe(false);
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('suppresses the otherwise-repeatable violation event when requested', async () => {
    const { eventOutboxHelper, helper } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', null, TimeTypeCategory.WORK),
    ]);

    await helper.closingChecklist(ADMIN_USER, PERIOD.id, undefined, false);

    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('emits an error checklist event on each repeat read', async () => {
    const { eventOutboxHelper, helper } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', null, TimeTypeCategory.WORK),
    ]);

    await helper.closingChecklist(ADMIN_USER, PERIOD.id);
    await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledTimes(2);
  });

  it('returns clean zero metrics without querying person-scoped aggregates for an empty population', async () => {
    const { eventOutboxHelper, helper, timeThresholdPolicyHelper, tx } = makeHelper([], {
      people: [],
    });

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.hasErrors).toBe(false);
    expect(timeThresholdPolicyHelper.getActiveThresholds).toHaveBeenCalledOnce();
    expect(tx.booking.findMany).not.toHaveBeenCalled();
    expect(tx.absence.findMany).not.toHaveBeenCalled();
    expect(tx.absence.count).not.toHaveBeenCalled();
    expect(tx.workflowInstance.count).not.toHaveBeenCalled();
    expect(tx.timeAccount.count).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('uses the supplied transaction client for plan-versus-actual coverage', async () => {
    const { helper, tx } = makeHelper([
      booking('2026-03-02T08:00:00.000Z', '2026-03-02T16:00:00.000Z', TimeTypeCategory.WORK),
    ]);

    const result = await helper.buildPlanVsActualForRoster(
      {
        id: 'roster-1',
        organizationUnitId: 'unit-1',
        periodStart: PERIOD.periodStart,
        periodEnd: PERIOD.periodEnd,
        shifts: [
          {
            id: 'shift-1',
            personId: 'person-1',
            startTime: new Date('2026-03-02T08:00:00.000Z'),
            endTime: new Date('2026-03-02T16:00:00.000Z'),
            shiftType: 'DAY',
            minStaffing: 1,
            assignments: [],
          },
        ],
      },
      tx as never,
    );

    expect(tx.booking.findMany).toHaveBeenCalledOnce();
    expect(result.slots[0]).toMatchObject({ shiftId: 'shift-1', actualHeadcount: 1 });
  });

  it('preloads eligible bookings once and keeps multi-unit roster coverage isolated', async () => {
    const multiUnitPeriod = { ...PERIOD, organizationUnitId: null };
    const { helper, tx } = makeHelper(
      [
        booking(
          '2026-03-02T08:00:00.000Z',
          '2026-03-02T16:00:00.000Z',
          TimeTypeCategory.WORK,
          'person-1',
          'unit-1',
        ),
        booking(
          '2026-03-02T08:00:00.000Z',
          '2026-03-02T16:00:00.000Z',
          TimeTypeCategory.DEPLOYMENT,
          'person-2',
          'unit-2',
        ),
        booking('2026-03-02T07:00:00.000Z', null, TimeTypeCategory.WORK, 'person-3', 'unit-1'),
      ],
      {
        people: [{ id: 'person-1' }, { id: 'person-2' }],
        period: multiUnitPeriod,
        rosters: [
          {
            id: 'roster-1',
            organizationUnitId: 'unit-1',
            periodStart: new Date('2026-03-02T08:00:00.000Z'),
            periodEnd: new Date('2026-03-02T16:00:00.000Z'),
            shifts: [
              {
                id: 'shift-1',
                personId: 'person-1',
                startTime: new Date('2026-03-02T08:00:00.000Z'),
                endTime: new Date('2026-03-02T16:00:00.000Z'),
                shiftType: 'DAY',
                minStaffing: 2,
                assignments: [],
              },
            ],
          },
          {
            id: 'roster-2',
            organizationUnitId: 'unit-2',
            periodStart: new Date('2026-03-02T08:00:00.000Z'),
            periodEnd: new Date('2026-03-02T16:00:00.000Z'),
            shifts: [
              {
                id: 'shift-2',
                personId: null,
                startTime: new Date('2026-03-02T08:00:00.000Z'),
                endTime: new Date('2026-03-02T16:00:00.000Z'),
                shiftType: 'DAY',
                minStaffing: 2,
                assignments: [{ personId: 'person-2' }],
              },
            ],
          },
        ],
      },
    );

    const checklist = await helper.closingChecklist(ADMIN_USER, multiUnitPeriod.id);

    expect(tx.booking.findMany).toHaveBeenCalledTimes(2);
    expect(tx.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          person: { organizationUnitId: { in: ['unit-1', 'unit-2'] } },
          startTime: { lt: expect.any(Date) },
          OR: expect.arrayContaining([
            { endTime: { gt: expect.any(Date) } },
            { endTime: null, startTime: { gte: expect.any(Date) } },
          ]),
        }),
      }),
    );
    expect(checklist.items.find((item) => item.code === 'ROSTER_MISMATCHES')).toMatchObject({
      details: '2 plan-vs-actual mismatches',
    });
  });

  it('aggregates same-day work intervals for daily maximum and break violations', async () => {
    const { helper } = makeHelper([
      booking('2026-03-02T07:00:00.000Z', '2026-03-02T13:00:00.000Z', TimeTypeCategory.WORK),
      booking('2026-03-02T14:00:00.000Z', '2026-03-02T20:00:00.000Z', TimeTypeCategory.WORK),
    ]);

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.items.find((item) => item.code === 'RULE_VIOLATIONS')).toMatchObject({
      status: 'OPEN',
      severity: 'ERROR',
      details: '2 unresolved policy violations',
    });
  });

  it('applies the configured rest threshold between different Berlin workdays', async () => {
    const { helper } = makeHelper([
      booking('2026-03-02T18:00:00.000Z', '2026-03-02T22:00:00.000Z', TimeTypeCategory.WORK),
      booking('2026-03-03T08:00:00.000Z', '2026-03-03T12:00:00.000Z', TimeTypeCategory.WORK),
    ]);

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.items.find((item) => item.code === 'RULE_VIOLATIONS')).toMatchObject({
      status: 'OPEN',
      severity: 'ERROR',
      details: '1 unresolved policy violation',
    });
  });

  it('does not treat PAUSE or other non-work bookings as work coverage or rule intervals', async () => {
    const { helper } = makeHelper([
      booking('2026-03-02T07:00:00.000Z', '2026-03-02T19:00:00.000Z', TimeTypeCategory.PAUSE),
      booking('2026-03-03T07:00:00.000Z', '2026-03-03T19:00:00.000Z', TimeTypeCategory.ON_CALL),
    ]);

    const checklist = await helper.closingChecklist(ADMIN_USER, PERIOD.id);

    expect(checklist.items.find((item) => item.code === 'MISSING_BOOKINGS')).toMatchObject({
      status: 'OPEN',
      severity: 'ERROR',
    });
    expect(checklist.items.find((item) => item.code === 'RULE_VIOLATIONS')).toMatchObject({
      status: 'RESOLVED',
    });
  });
});
