import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ReportingComplianceHelper } from '../reporting-compliance.helper.js';

const originalMinimum = process.env.REPORT_MIN_GROUP_SIZE;

function helper(): ReportingComplianceHelper {
  return new ReportingComplianceHelper(null as never, null as never, null as never);
}

function createAuditSummaryHelper(input?: {
  entries?: number;
  actors?: string[];
  actions?: Array<{ action: string; count: number }>;
  entityTypes?: Array<{ entityType: string; count: number }>;
}) {
  const prisma = {
    auditEntry: {
      count: vi.fn().mockResolvedValue(input?.entries ?? 0),
      groupBy: vi
        .fn()
        .mockResolvedValueOnce((input?.actors ?? []).map((actorId) => ({ actorId })))
        .mockResolvedValueOnce(
          (input?.actions ?? []).map(({ action, count }) => ({
            action,
            _count: { _all: count },
          })),
        )
        .mockResolvedValueOnce(
          (input?.entityTypes ?? []).map(({ entityType, count }) => ({
            entityType,
            _count: { _all: count },
          })),
        ),
    },
  };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const personHelper = { personForUser: vi.fn().mockResolvedValue({ id: 'person-1' }) };

  return {
    helper: new ReportingComplianceHelper(
      prisma as never,
      auditHelper as never,
      personHelper as never,
    ),
    prisma,
    auditHelper,
    personHelper,
  };
}

const adminUser = { sub: 'user-1', email: 'admin@example.test', role: 'ADMIN' };

afterEach(() => {
  if (originalMinimum === undefined) {
    delete process.env.REPORT_MIN_GROUP_SIZE;
  } else {
    process.env.REPORT_MIN_GROUP_SIZE = originalMinimum;
  }
});

describe('ReportingComplianceHelper privacy threshold', () => {
  it('never permits configuration below the governance minimum', () => {
    process.env.REPORT_MIN_GROUP_SIZE = '1';
    expect(helper().minGroupSize()).toBe(5);
  });

  it('falls back safely for invalid configuration', () => {
    process.env.REPORT_MIN_GROUP_SIZE = 'not-a-number';
    expect(helper().minGroupSize()).toBe(5);
  });

  it('allows stricter configured thresholds', () => {
    process.env.REPORT_MIN_GROUP_SIZE = '8';
    expect(helper().minGroupSize()).toBe(8);
  });
});

describe('ReportingComplianceHelper audit summary', () => {
  it('uses bounded count and grouping queries and sorts representative output', async () => {
    const {
      helper: reportHelper,
      prisma,
      auditHelper,
    } = createAuditSummaryHelper({
      entries: 7,
      actors: ['actor-b', 'actor-a'],
      actions: [
        { action: 'REPORT_ACCESSED', count: 3 },
        { action: 'BOOKING_CREATED', count: 1 },
        { action: 'CLOSING_LOCK_BLOCKED', count: 2 },
        { action: 'CLOSING_EXPORTED', count: 1 },
      ],
      entityTypes: [
        { entityType: 'Roster', count: 2 },
        { entityType: 'Booking', count: 5 },
      ],
    });

    await expect(
      reportHelper.reportAuditSummary(adminUser as never, {
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).resolves.toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      totals: {
        entries: 7,
        uniqueActors: 2,
        reportAccesses: 3,
        exportsTriggered: 1,
        lockBlocks: 2,
      },
      byAction: [
        { action: 'BOOKING_CREATED', count: 1 },
        { action: 'CLOSING_EXPORTED', count: 1 },
        { action: 'CLOSING_LOCK_BLOCKED', count: 2 },
        { action: 'REPORT_ACCESSED', count: 3 },
      ],
      byEntityType: [
        { entityType: 'Booking', count: 5 },
        { entityType: 'Roster', count: 2 },
      ],
    });

    const dateRange = {
      timestamp: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T23:59:59.999Z'),
      },
    };
    expect(prisma.auditEntry.count).toHaveBeenCalledExactlyOnceWith({ where: dateRange });
    expect(prisma.auditEntry.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['actorId'],
      where: dateRange,
    });
    expect(prisma.auditEntry.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['action'],
      where: dateRange,
      _count: { _all: true },
    });
    expect(prisma.auditEntry.groupBy).toHaveBeenNthCalledWith(3, {
      by: ['entityType'],
      where: dateRange,
      _count: { _all: true },
    });
    expect(prisma.auditEntry).not.toHaveProperty('findMany');
    expect(auditHelper.appendAudit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actorId: 'person-1',
        action: 'REPORT_ACCESSED',
        entityId: 'audit-summary:2026-01-01:2026-01-31',
      }),
    );
  });

  it('returns exact zero totals and empty deterministic groups', async () => {
    const { helper: reportHelper, auditHelper } = createAuditSummaryHelper();

    await expect(
      reportHelper.reportAuditSummary(adminUser as never, {
        from: '2026-02-01',
        to: '2026-02-28',
      }),
    ).resolves.toMatchObject({
      totals: {
        entries: 0,
        uniqueActors: 0,
        reportAccesses: 0,
        exportsTriggered: 0,
        lockBlocks: 0,
      },
      byAction: [],
      byEntityType: [],
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledOnce();
  });

  it('does not emit an access audit event when aggregation fails', async () => {
    const { helper: reportHelper, prisma, auditHelper } = createAuditSummaryHelper();
    prisma.auditEntry.count.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      reportHelper.reportAuditSummary(adminUser as never, {
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).rejects.toThrow('database unavailable');

    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('rejects unauthorized users before person or audit data access', async () => {
    const { helper: reportHelper, prisma, personHelper } = createAuditSummaryHelper();

    await expect(
      reportHelper.reportAuditSummary({ ...adminUser, role: 'EMPLOYEE' } as never, {
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(prisma.auditEntry.count).not.toHaveBeenCalled();
    expect(prisma.auditEntry.groupBy).not.toHaveBeenCalled();
  });
});
