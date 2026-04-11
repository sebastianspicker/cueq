import { describe, expect, it } from 'vitest';
import { CreateBookingSchema } from '../schemas/booking';
import { AuditSummaryReportSchema, ComplianceSummaryReportSchema } from '../schemas/reporting';
import { CreateRosterSchema } from '../schemas/roster';
import { TimeRuleEvaluationRequestSchema } from '../schemas/time-engine';

describe('@cueq/shared integration', () => {
  it('validates create booking payloads', () => {
    const payload = {
      personId: 'c00000000000000000000001',
      timeTypeId: 'c00000000000000000000002',
      startTime: '2026-03-02T08:00:00.000Z',
      source: 'WEB',
    };

    expect(CreateBookingSchema.parse(payload)).toMatchObject(payload);
  });

  it('validates time-rule evaluation payloads', () => {
    const payload = {
      week: '2026-W10',
      targetHours: 39.83,
      timezone: 'Europe/Berlin',
      holidayDates: ['2026-04-05'],
      intervals: [
        {
          start: '2026-03-03T07:00:00.000Z',
          end: '2026-03-03T15:00:00.000Z',
          type: 'WORK',
        },
      ],
    };

    expect(TimeRuleEvaluationRequestSchema.parse(payload)).toMatchObject(payload);
  });

  it('validates create roster payloads', () => {
    const payload = {
      organizationUnitId: 'c00000000000000000000001',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.000Z',
    };

    expect(CreateRosterSchema.parse(payload)).toMatchObject(payload);
  });

  it('validates report summary payloads', () => {
    const auditPayload = {
      from: '2026-03-01',
      to: '2026-03-31',
      totals: {
        entries: 10,
        uniqueActors: 2,
        reportAccesses: 4,
        exportsTriggered: 1,
        lockBlocks: 1,
      },
      byAction: [{ action: 'REPORT_ACCESSED', count: 4 }],
      byEntityType: [{ entityType: 'Report', count: 4 }],
    };

    const compliancePayload = {
      from: '2026-03-01',
      to: '2026-03-31',
      privacy: {
        minGroupSize: 5,
        reportAccesses: 4,
        suppressedReportAccesses: 1,
        suppressionRate: 0.25,
      },
      closing: {
        periods: 1,
        exported: 1,
        completionRate: 1,
        lockBlocks: 1,
        postCloseCorrections: 0,
      },
      payrollExport: {
        runs: 1,
        uniqueChecksums: 1,
        duplicateChecksums: 0,
        lastRunAt: '2026-03-31T23:59:59.000Z',
      },
      operations: {
        lastBackupRestoreVerifiedAt: null,
      },
    };

    expect(AuditSummaryReportSchema.parse(auditPayload)).toMatchObject(auditPayload);
    expect(ComplianceSummaryReportSchema.parse(compliancePayload)).toMatchObject(compliancePayload);
  });
});
