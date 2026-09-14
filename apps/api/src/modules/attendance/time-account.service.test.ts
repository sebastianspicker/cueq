import { Role, WorkflowStatus } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { TimeAccountService } from './time-account.service.js';

const decimal = (value: number) => ({ toNumber: () => value });
const period = {
  id: 'c00000000000000000000001',
  organizationUnitId: 'c00000000000000000000002',
  periodStart: new Date('2026-03-02T00:00:00.000Z'),
  periodEnd: new Date('2026-03-03T23:59:59.000Z'),
  status: 'OPEN',
};
const account = {
  id: 'c00000000000000000000003',
  personId: 'c00000000000000000000004',
  assignmentId: 'c00000000000000000000005',
  periodStart: period.periodStart,
  periodEnd: period.periodEnd,
  targetHours: decimal(16),
  actualHours: decimal(4),
  balance: decimal(-12),
  overtimeHours: decimal(2),
  createdAt: new Date('2026-03-04T00:00:00.000Z'),
  updatedAt: new Date('2026-03-04T00:00:00.000Z'),
};
const term = {
  id: 'term',
  organizationUnitId: period.organizationUnitId,
  effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
  effectiveTo: new Date('2026-04-01T00:00:00.000Z'),
  weeklyHours: 40,
  dailyTargetHours: 8,
  workingDays: [1, 2, 3, 4, 5],
  holidayCalendar: { holidayDates: [] },
};

function serviceWith(tx: Record<string, unknown>) {
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const people = { personForUser: vi.fn(async () => ({ id: 'actor' })) };
  const assignments = {
    selectAssignment: vi.fn(),
    resolveInterval: vi.fn(async () => ({ organizationUnitId: period.organizationUnitId })),
  };
  const audit = { appendAudit: vi.fn(async () => undefined) };
  const closingLocks = {
    assertClosingPeriodsUnlockedForRangesInTransaction: vi.fn(async () => undefined),
  };
  return {
    service: new TimeAccountService(
      prisma as never,
      people as never,
      assignments as never,
      audit as never,
      closingLocks as never,
    ),
    assignments,
    audit,
    closingLocks,
  };
}

describe('appointment time-account lifecycle', () => {
  it('rejects cross-person reads before resolving the requested appointment', async () => {
    const fixture = serviceWith({});

    await expect(
      fixture.service.listMine({ role: Role.EMPLOYEE } as never, {
        personId: account.personId,
        assignmentId: account.assignmentId,
        limit: 20,
      }),
    ).rejects.toThrow("Only HR/Admin can read another person's time accounts.");
    expect(fixture.assignments.selectAssignment).not.toHaveBeenCalled();
  });

  it('creates separate accounts at a configured term boundary', async () => {
    const firstTerm = { ...term, effectiveTo: new Date('2026-03-03T00:00:00.000Z') };
    const secondTerm = {
      ...term,
      id: 'term-two',
      effectiveFrom: firstTerm.effectiveTo,
      effectiveTo: new Date('2026-04-01T00:00:00.000Z'),
    };
    const create = vi.fn(async () => account);
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      closingPeriod: { findUnique: vi.fn(async () => period) },
      employmentAssignment: {
        findMany: vi.fn(async () => [
          {
            id: account.assignmentId,
            personId: account.personId,
            employmentStartDate: null,
            employmentEndDate: null,
            terms: [firstTerm, secondTerm],
          },
        ]),
      },
      booking: { findMany: vi.fn(async () => []) },
      timeAccount: { findMany: vi.fn(async () => []), update: vi.fn(), create },
    };
    const fixture = serviceWith(tx);

    await expect(fixture.service.prepareClosingPeriod('actor', period.id)).resolves.toEqual({
      closingPeriodId: period.id,
      created: 2,
      existing: 0,
    });
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          periodStart: period.periodStart,
          periodEnd: firstTerm.effectiveTo,
          targetHours: 8,
        }),
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          periodStart: firstTerm.effectiveTo,
          periodEnd: period.periodEnd,
          targetHours: 8,
        }),
      }),
    );
  });

  it('recalculates an existing compatible OPEN account while preserving approved overtime', async () => {
    const update = vi.fn(async ({ data }: { data: Record<string, number> }) => ({
      ...account,
      ...data,
    }));
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      closingPeriod: { findUnique: vi.fn(async () => period) },
      employmentAssignment: {
        findMany: vi.fn(async () => [
          {
            id: account.assignmentId,
            personId: account.personId,
            employmentStartDate: null,
            employmentEndDate: null,
            terms: [term],
          },
        ]),
      },
      booking: {
        findMany: vi.fn(async () => [
          {
            startTime: new Date('2026-03-02T08:00:00.000Z'),
            endTime: new Date('2026-03-02T13:00:00.000Z'),
          },
        ]),
      },
      timeAccount: { findMany: vi.fn(async () => [account]), update, create: vi.fn() },
    };
    const fixture = serviceWith(tx);
    await expect(fixture.service.prepareClosingPeriod('actor', period.id)).resolves.toEqual({
      closingPeriodId: period.id,
      created: 0,
      existing: 1,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: { targetHours: 16, actualHours: 5, balance: -11 },
    });
    expect(fixture.audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TIME_ACCOUNTS_PREPARED' }),
      tx,
    );
  });

  it('rejects a closing interval with a gap in effective appointment terms', async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      employmentAssignment: {
        findMany: vi.fn(async () => [
          {
            id: account.assignmentId,
            personId: account.personId,
            employmentStartDate: null,
            employmentEndDate: null,
            terms: [{ ...term, effectiveFrom: new Date('2026-03-03T00:00:00.000Z') }],
          },
        ]),
      },
      booking: { findMany: vi.fn() },
      timeAccount: { findMany: vi.fn() },
    };
    const fixture = serviceWith(tx);
    await expect(fixture.service.countMissingForClosing(tx as never, period)).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    expect(tx.booking.findMany).not.toHaveBeenCalled();
  });

  it('splits contiguously, preserves aggregate values, and retains the workflow target row', async () => {
    const first = {
      ...account,
      periodEnd: new Date('2026-03-03T00:00:00.000Z'),
      targetHours: decimal(8),
      actualHours: decimal(3),
      balance: decimal(-5),
      overtimeHours: decimal(1),
    };
    const second = {
      ...account,
      id: 'c00000000000000000000006',
      periodStart: first.periodEnd,
      targetHours: decimal(8),
      actualHours: decimal(1),
      balance: decimal(-7),
      overtimeHours: decimal(1),
    };
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      timeAccount: {
        findUnique: vi.fn(async () => account),
        findUniqueOrThrow: vi.fn(async () => account),
        findMany: vi.fn(async () => []),
        update: vi.fn(async () => first),
        create: vi.fn(async () => second),
      },
      employmentTerm: {
        findMany: vi.fn(async () => [{ organizationUnitId: period.organizationUnitId }]),
      },
      workflowInstance: { findFirst: vi.fn(async () => null) },
    };
    const fixture = serviceWith(tx);
    const result = await fixture.service.split({ role: Role.HR } as never, account.id, {
      expectedUpdatedAt: account.updatedAt.toISOString(),
      reason: 'Split at the configured appointment boundary.',
      segments: [
        {
          periodStart: account.periodStart.toISOString(),
          periodEnd: first.periodEnd.toISOString(),
          targetHours: 8,
          actualHours: 3,
          balance: -5,
          overtimeHours: 1,
        },
        {
          periodStart: first.periodEnd.toISOString(),
          periodEnd: account.periodEnd.toISOString(),
          targetHours: 8,
          actualHours: 1,
          balance: -7,
          overtimeHours: 1,
        },
      ],
    });
    expect(result.map((row) => row.id)).toEqual([account.id, second.id]);
    expect(tx.timeAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: account.id } }),
    );
    expect(fixture.assignments.resolveInterval).toHaveBeenCalledTimes(2);
  });

  it('rejects a split that changes stored account totals', async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      timeAccount: {
        findUnique: vi.fn(async () => account),
        findUniqueOrThrow: vi.fn(async () => account),
      },
      employmentTerm: {
        findMany: vi.fn(async () => [{ organizationUnitId: period.organizationUnitId }]),
      },
      workflowInstance: { findFirst: vi.fn(async () => ({ status: WorkflowStatus.APPROVED })) },
    };
    const fixture = serviceWith(tx);
    await expect(
      fixture.service.split({ role: Role.ADMIN } as never, account.id, {
        expectedUpdatedAt: account.updatedAt.toISOString(),
        reason: 'Attempt an invalid aggregate replacement.',
        segments: [
          {
            periodStart: account.periodStart.toISOString(),
            periodEnd: '2026-03-03T00:00:00.000Z',
            targetHours: 8,
            actualHours: 2,
            balance: -6,
            overtimeHours: 1,
          },
          {
            periodStart: '2026-03-03T00:00:00.000Z',
            periodEnd: account.periodEnd.toISOString(),
            targetHours: 8,
            actualHours: 1,
            balance: -7,
            overtimeHours: 1,
          },
        ],
      }),
    ).rejects.toThrow('preserve target, actual, balance and approved overtime totals');
  });
});
