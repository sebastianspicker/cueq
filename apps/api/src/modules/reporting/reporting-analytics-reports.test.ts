import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { PersonHelper } from '../people/public.js';
// Reference reducer retained to compare aggregate fixture results.
function absenceTotals(absences: Array<{ days: unknown }>) {
  return {
    requests: absences.length,
    days: Number(absences.reduce((sum, absence) => sum + Number(absence.days), 0).toFixed(2)),
  };
}

function absenceTypeBuckets(absences: Array<{ type: string; days: unknown }>) {
  const byType = new Map<string, { requests: number; days: number }>();
  for (const absence of absences) {
    const current = byType.get(absence.type) ?? { requests: 0, days: 0 };
    current.requests += 1;
    current.days += Number(absence.days);
    byType.set(absence.type, current);
  }

  return [...byType.entries()].map(([type, value]) => ({
    type,
    requests: value.requests,
    days: Number(value.days.toFixed(2)),
  }));
}

import { reportOeOvertime, reportTeamAbsence } from './reporting-analytics-reports.helper.js';
import type { ReportingComplianceHelper } from './reporting-compliance.helper.js';

describe('reporting aggregation', () => {
  it('uses one effective-appointment aggregate and a distinct-person overtime population', async () => {
    const rawQueries: Array<{ sql: string; values: unknown[] }> = [];
    const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      rawQueries.push({ sql: strings.join('?'), values });
      return [
        {
          people: 6,
          totalBalanceHours: '30.03',
          totalOvertimeHours: '12.12',
          invalidAccounts: 0,
        },
      ];
    });
    const appendAudit = vi.fn(async () => undefined);

    const result = await reportOeOvertime(
      {
        prisma: { $queryRaw: queryRaw } as unknown as PrismaService,
        auditHelper: { appendAudit } as unknown as AuditHelper,
        personHelper: {
          personForUser: async () => ({ id: 'actor', organizationUnitId: 'ou-1' }),
        } as unknown as PersonHelper,
        complianceHelper: { minGroupSize: () => 5 } as ReportingComplianceHelper,
      },
      {
        subject: 'actor-user',
        email: 'actor@example.test',
        role: Role.HR,
        claims: {},
      },
      { from: '2026-01-01', to: '2026-01-31' },
    );

    expect(result).toMatchObject({
      suppression: { suppressed: false, population: 6 },
      totals: {
        people: 6,
        totalBalanceHours: 30.03,
        totalOvertimeHours: 12.12,
        avgBalanceHours: 5,
      },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(rawQueries[0]?.sql).toContain('COUNT(DISTINCT "personId") FILTER (WHERE eligible)');
    expect(rawQueries[0]?.sql).toContain('FROM "employment_terms" AS term');
    expect(rawQueries[0]?.sql).toContain('term."effectiveTo" >= account."periodEnd"');
    expect(rawQueries[0]?.sql).not.toContain('person."organizationUnitId"');
    expect(rawQueries[0]?.values).toHaveLength(4);
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });

  it('requires reconciliation instead of allocating one account across term boundaries', async () => {
    const queryRaw = vi.fn(async () => [
      {
        people: 0,
        totalBalanceHours: 0,
        totalOvertimeHours: 0,
        invalidAccounts: 1,
      },
    ]);
    const appendAudit = vi.fn(async () => undefined);

    await expect(
      reportOeOvertime(
        {
          prisma: { $queryRaw: queryRaw } as unknown as PrismaService,
          auditHelper: { appendAudit } as unknown as AuditHelper,
          personHelper: {
            personForUser: async () => ({ id: 'actor', organizationUnitId: 'ou-1' }),
          } as unknown as PersonHelper,
          complianceHelper: { minGroupSize: () => 5 } as ReportingComplianceHelper,
        },
        {
          subject: 'actor-user',
          email: 'actor@example.test',
          role: Role.HR,
          claims: {},
        },
        { from: '2026-01-01', to: '2026-01-31' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'TIME_ACCOUNT_RECONCILIATION_REQUIRED' },
    });
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('uses distinct people for privacy and attributes absences through their appointment terms', async () => {
    const referenceRows = [
      { type: 'SICK', days: '0.10' },
      { type: 'VACATION', days: '1.25' },
      { type: 'SICK', days: '0.20' },
    ];
    const rawQueries: Array<{ sql: string; values: unknown[] }> = [];
    const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      rawQueries.push({ sql, values });
      if (sql.includes('COUNT(DISTINCT assignment."personId")')) return [{ people: 5 }];
      return [
        { type: 'SICK', requests: 2, days: '0.30' },
        { type: 'VACATION', requests: 1, days: '1.25' },
      ];
    });
    const appendAudit = vi.fn(async () => undefined);

    const result = await reportTeamAbsence(
      {
        prisma: { $queryRaw: queryRaw } as unknown as PrismaService,
        auditHelper: { appendAudit } as unknown as AuditHelper,
        personHelper: {
          personForUser: async () => ({ id: 'actor', organizationUnitId: 'ou-1' }),
        } as unknown as PersonHelper,
        complianceHelper: { minGroupSize: () => 5 } as ReportingComplianceHelper,
      },
      {
        subject: 'actor-user',
        email: 'actor@example.test',
        role: Role.HR,
        claims: {},
      },
      { from: '2026-01-01', to: '2026-01-31' },
    );

    expect(result).toMatchObject({
      suppression: { suppressed: false, population: 5 },
      totals: absenceTotals(referenceRows),
      buckets: absenceTypeBuckets(referenceRows),
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(rawQueries[0]?.sql).toContain('COUNT(DISTINCT assignment."personId")');
    expect(rawQueries[1]?.sql).toContain('term."assignmentId" = absence."assignmentId"');
    expect(rawQueries[1]?.sql).toContain('other_term."organizationUnitId" <>');
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });
});
