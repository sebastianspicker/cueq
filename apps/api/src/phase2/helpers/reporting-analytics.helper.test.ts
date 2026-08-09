import { describe, expect, it, vi } from 'vitest';
import { ClosingStatus, Role } from '@cueq/database';
import { ReportingAnalyticsHelper } from './reporting-analytics.helper.js';

const ORGANIZATION_UNIT_ID = 'c000000000000000000000001';
const ACTOR_ID = 'c000000000000000000000002';
const user = (role: Role) => ({
  subject: 'subject',
  email: 'reporter@cueq.local',
  role,
  personId: ACTOR_ID,
  claims: {},
});

describe('ReportingAnalyticsHelper', () => {
  it('keeps HR team-absence aggregates, type buckets, query shape, and audit payloads', async () => {
    const prisma = {
      person: { count: vi.fn().mockResolvedValue(2) },
      absence: {
        findMany: vi.fn().mockResolvedValue([
          { type: 'ANNUAL_LEAVE', days: 1.2 },
          { type: 'ANNUAL_LEAVE', days: 2.35 },
        ]),
      },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new ReportingAnalyticsHelper(
      prisma as never,
      auditHelper as never,
      {
        personForUser: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      } as never,
      { minGroupSize: vi.fn().mockReturnValue(2) } as never,
    );

    const report = await helper.reportTeamAbsence(user(Role.HR), {
      organizationUnitId: ORGANIZATION_UNIT_ID,
      from: '2026-03-01',
      to: '2026-03-31',
    });

    expect(prisma.absence.findMany).toHaveBeenCalledWith({
      where: {
        person: { organizationUnitId: ORGANIZATION_UNIT_ID },
        startDate: { lte: new Date('2026-03-31T23:59:59.000Z') },
        endDate: { gte: new Date('2026-03-01T00:00:00.000Z') },
      },
    });
    expect(report).toMatchObject({
      suppression: { suppressed: false, minGroupSize: 2, population: 2 },
      totals: { requests: 2, days: 3.55 },
      buckets: [{ type: 'ANNUAL_LEAVE', requests: 2, days: 3.55 }],
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR_ID,
        entityId: 'team-absence:c000000000000000000000001:2026-03-01:2026-03-31',
        after: expect.objectContaining({ absenceTypeBucketsVisible: true }),
      }),
    );
  });

  it('suppresses overtime only after counting distinct account holders and still audits access', async () => {
    const prisma = {
      timeAccount: {
        findMany: vi.fn().mockResolvedValue([
          { personId: ACTOR_ID, balance: 1.2, overtimeHours: 2.3 },
          { personId: ACTOR_ID, balance: 3.4, overtimeHours: 4.5 },
        ]),
      },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new ReportingAnalyticsHelper(
      prisma as never,
      auditHelper as never,
      {
        personForUser: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      } as never,
      { minGroupSize: vi.fn().mockReturnValue(2) } as never,
    );

    const report = await helper.reportOeOvertime(user(Role.HR), {
      from: '2026-03-01',
      to: '2026-03-31',
    });

    expect(report).toMatchObject({
      suppression: { suppressed: true, minGroupSize: 2, population: 1 },
      totals: { people: 0, totalBalanceHours: 0, totalOvertimeHours: 0, avgBalanceHours: 0 },
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledOnce();
  });

  it('forces a team lead to its own unit for closing completion and preserves completion rounding', async () => {
    const prisma = {
      closingPeriod: {
        findMany: vi.fn().mockResolvedValue([
          { status: ClosingStatus.EXPORTED, organizationUnitId: ORGANIZATION_UNIT_ID },
          { status: ClosingStatus.CLOSED, organizationUnitId: ORGANIZATION_UNIT_ID },
          { status: ClosingStatus.OPEN, organizationUnitId: ORGANIZATION_UNIT_ID },
        ]),
      },
    };
    const helper = new ReportingAnalyticsHelper(
      prisma as never,
      { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
      {
        personForUser: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      } as never,
      { minGroupSize: vi.fn() } as never,
    );

    const report = await helper.reportClosingCompletion(user(Role.TEAM_LEAD), {
      from: '2026-03-01',
      to: '2026-03-31',
    });

    expect(prisma.closingPeriod.findMany).toHaveBeenCalledWith({
      where: {
        organizationUnitId: ORGANIZATION_UNIT_ID,
        periodStart: { lte: new Date('2026-03-31T23:59:59.000Z') },
        periodEnd: { gte: new Date('2026-03-01T00:00:00.000Z') },
      },
      select: { status: true, organizationUnitId: true },
    });
    expect(report).toMatchObject({
      organizationUnitId: ORGANIZATION_UNIT_ID,
      totals: { periods: 3, exported: 1, closed: 1, review: 0, open: 1, completionRate: 0.3333 },
    });
  });
});
