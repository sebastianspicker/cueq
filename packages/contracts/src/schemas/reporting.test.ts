import { describe, expect, it } from 'vitest';
import * as reporting from './reporting.js';

const ORGANIZATION_UNIT_ID = 'c000000000000000000000001';

describe('reporting schema public barrel', () => {
  it('retains the complete runtime schema export inventory', () => {
    expect(Object.keys(reporting).sort()).toEqual(
      [
        'AuditEntriesQuerySchema',
        'AuditEntriesResultSchema',
        'AuditEntryItemSchema',
        'AuditSummaryQuerySchema',
        'AuditSummaryReportSchema',
        'ClosingCompletionQuerySchema',
        'ClosingCompletionReportSchema',
        'ComplianceSummaryQuerySchema',
        'ComplianceSummaryReportSchema',
        'CustomReportGroupBySchema',
        'CustomReportMetricSchema',
        'CustomReportOptionsSchema',
        'CustomReportPreviewQueryParamsSchema',
        'CustomReportPreviewQuerySchema',
        'CustomReportPreviewRowSchema',
        'CustomReportPreviewSchema',
        'CustomReportTypeSchema',
        'OeOvertimeQuerySchema',
        'OeOvertimeReportSchema',
        'ReportActionCountSchema',
        'ReportEntityTypeCountSchema',
        'ReportSuppressionSchema',
        'TeamAbsenceBucketSchema',
        'TeamAbsenceQuerySchema',
        'TeamAbsenceReportSchema',
      ].sort(),
    );
  });

  it('keeps the organization-date query schemas as one shared schema instance with identical range errors', () => {
    expect(reporting.TeamAbsenceQuerySchema).toBe(reporting.OeOvertimeQuerySchema);
    expect(reporting.OeOvertimeQuerySchema).toBe(reporting.ClosingCompletionQuerySchema);
    expect(
      reporting.TeamAbsenceQuerySchema.parse({
        organizationUnitId: ORGANIZATION_UNIT_ID,
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    ).toEqual({
      organizationUnitId: ORGANIZATION_UNIT_ID,
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(() =>
      reporting.ClosingCompletionQuerySchema.parse({ from: '2026-03-31', to: '2026-03-01' }),
    ).toThrow('to must be on or after from');
  });

  it('preserves custom preview coercion, cardinality, and nullable closing-unit behavior', () => {
    expect(
      reporting.CustomReportPreviewQueryParamsSchema.parse({
        reportType: 'TEAM_ABSENCE',
        groupBy: 'ORGANIZATION_UNIT',
        metrics: 'requests',
        from: '2026-03-01',
        to: '2026-03-31',
      }).metrics,
    ).toEqual(['requests']);
    expect(() =>
      reporting.CustomReportPreviewQuerySchema.parse({
        reportType: 'TEAM_ABSENCE',
        groupBy: 'NONE',
        metrics: ['requests', 'days', 'people', 'exported', 'completionRate'],
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    ).toThrow();
    expect(
      reporting.ClosingCompletionReportSchema.parse({
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: null,
        totals: { periods: 0, exported: 0, closed: 0, review: 0, open: 0, completionRate: 0 },
      }).organizationUnitId,
    ).toBeNull();
  });

  it('retains audit-entry defaults, coercion, and optional date-range validation', () => {
    expect(reporting.AuditEntriesQuerySchema.parse({ skip: '2', take: '20' })).toMatchObject({
      skip: 2,
      take: 20,
    });
    expect(() =>
      reporting.AuditEntriesQuerySchema.parse({
        from: '2026-03-31T00:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      }),
    ).toThrow('to must be on or after from');
  });
});
