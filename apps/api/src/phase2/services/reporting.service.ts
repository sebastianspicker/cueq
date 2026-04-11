import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { CustomReportOptionsSchema, CustomReportPreviewQuerySchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { REPORT_ALLOWED_ROLES } from '../helpers/role-constants';
import { ReportingComplianceHelper } from '../helpers/reporting-compliance.helper';
import { ReportingAnalyticsHelper } from '../helpers/reporting-analytics.helper';

const METRIC_ALLOW_LIST: Record<string, Set<string>> = {
  TEAM_ABSENCE: new Set(['requests', 'days']),
  OE_OVERTIME: new Set(['people', 'totalOvertimeHours']),
  CLOSING_COMPLETION: new Set(['completionRate', 'exported']),
};

@Injectable()
export class ReportingService {
  constructor(
    @Inject(ReportingComplianceHelper) private readonly complianceHelper: ReportingComplianceHelper,
    @Inject(ReportingAnalyticsHelper) private readonly analyticsHelper: ReportingAnalyticsHelper,
  ) {}

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }

  /* ── Delegated to Analytics Helper ──────────────────────────── */

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportTeamAbsence(user, query);
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportOeOvertime(user, query);
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportClosingCompletion(user, query);
  }

  /* ── Delegated to Compliance Helper ──────────────────────────── */

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.complianceHelper.reportAuditSummary(user, query);
  }

  async reportComplianceSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.complianceHelper.reportComplianceSummary(user, query);
  }

  /* ── Custom Report ───────────────────────────────────────────── */

  reportCustomOptions(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit access to reports.');
    }

    return CustomReportOptionsSchema.parse({
      reportTypes: ['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION'],
      groupBy: ['ORGANIZATION_UNIT', 'NONE'],
      metrics: ['requests', 'days', 'people', 'totalOvertimeHours', 'completionRate', 'exported'],
    });
  }

  async reportCustomPreview(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const normalizedQuery =
      query && typeof query === 'object' && !Array.isArray(query)
        ? { ...(query as Record<string, unknown>) }
        : {};
    if (typeof normalizedQuery.metrics === 'string') {
      normalizedQuery.metrics = [normalizedQuery.metrics];
    }

    const parsed = CustomReportPreviewQuerySchema.parse(normalizedQuery);

    const allowedMetrics = METRIC_ALLOW_LIST[parsed.reportType];
    const disallowed = parsed.metrics.filter((metric) => !allowedMetrics?.has(metric));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Unsupported metrics for ${parsed.reportType}: ${disallowed.join(', ')}`,
      );
    }

    if (parsed.reportType === 'TEAM_ABSENCE') {
      const report = await this.analyticsHelper.reportTeamAbsence(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('requests')) metricValues.requests = report.totals.requests;
      if (parsed.metrics.includes('days')) metricValues.days = report.totals.days;

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    if (parsed.reportType === 'OE_OVERTIME') {
      const report = await this.analyticsHelper.reportOeOvertime(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('people')) metricValues.people = report.totals.people;
      if (parsed.metrics.includes('totalOvertimeHours'))
        metricValues.totalOvertimeHours = report.totals.totalOvertimeHours;

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    const report = await this.analyticsHelper.reportClosingCompletion(user, {
      from: parsed.from,
      to: parsed.to,
    });
    const metricValues: Record<string, number> = {};
    if (parsed.metrics.includes('completionRate'))
      metricValues.completionRate = report.totals.completionRate;
    if (parsed.metrics.includes('exported')) metricValues.exported = report.totals.exported;

    return {
      reportType: parsed.reportType,
      groupBy: parsed.groupBy,
      from: parsed.from,
      to: parsed.to,
      rows: [{ group: 'ALL', metrics: metricValues }],
    };
  }
}
