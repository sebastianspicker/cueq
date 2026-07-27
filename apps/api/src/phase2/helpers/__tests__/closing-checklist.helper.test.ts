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

function booking(
  start: string,
  end: string | null,
  category: TimeTypeCategory,
  personId = 'person-1',
) {
  return {
    personId,
    startTime: new Date(start),
    endTime: end ? new Date(end) : null,
    timeType: { category },
  };
}

function makeHelper(bookings: ReturnType<typeof booking>[]) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    closingPeriod: { findUnique: vi.fn().mockResolvedValue(PERIOD) },
    person: { findMany: vi.fn().mockResolvedValue([{ id: 'person-1' }]) },
    booking: { findMany: vi.fn().mockResolvedValue(bookings) },
    absence: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    workflowInstance: { count: vi.fn().mockResolvedValue(0) },
    roster: { findMany: vi.fn().mockResolvedValue([]) },
    timeAccount: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const eventOutboxHelper = {
    enqueueDomainEvent: vi.fn().mockResolvedValue(undefined),
  };
  const helper = new ClosingChecklistHelper(
    prisma as never,
    {
      personForUser: vi.fn().mockResolvedValue({ organizationUnitId: 'unit-1' }),
    } as never,
    eventOutboxHelper as never,
    {
      getActiveThresholds: vi.fn().mockResolvedValue({
        dailyMaxMinutes: 600,
        minRestMinutes: 660,
      }),
    } as never,
  );
  return { eventOutboxHelper, helper, prisma, tx };
}

describe('ClosingChecklistHelper', () => {
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
