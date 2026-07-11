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

type CustomPreviewBase = {
  reportType: string;
  groupBy: string;
  from: string;
  to: string;
  metrics: string[];
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

  private selectMetrics(totals: Record<string, number>, metrics: string[]): Record<string, number> {
    const selected: Record<string, number> = {};
    for (const metric of metrics) {
      selected[metric] = totals[metric] as number;
    }
    return selected;
  }

  private buildCustomPreviewResponse(
    parsed: CustomPreviewBase,
    report: {
      organizationUnitId: string | null;
      totals: Record<string, number>;
      suppression?: unknown;
    },
  ) {
    return {
      reportType: parsed.reportType,
      groupBy: parsed.groupBy,
      from: parsed.from,
      to: parsed.to,
      ...(report.suppression === undefined ? {} : { suppression: report.suppression }),
      rows: [
        {
          group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
          metrics: this.selectMetrics(report.totals, parsed.metrics),
        },
      ],
    };
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
      return this.buildCustomPreviewResponse(parsed, report);
    }

    if (parsed.reportType === 'OE_OVERTIME') {
      const report = await this.analyticsHelper.reportOeOvertime(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      return this.buildCustomPreviewResponse(parsed, report);
    }

    if (parsed.reportType === 'CLOSING_COMPLETION' && parsed.groupBy === 'ORGANIZATION_UNIT') {
      if (!parsed.organizationUnitId) {
        throw new BadRequestException(
          'CLOSING_COMPLETION grouped by ORGANIZATION_UNIT requires organizationUnitId.',
        );
      }
    }

    const report = await this.analyticsHelper.reportClosingCompletion(user, {
      organizationUnitId: parsed.organizationUnitId,
      from: parsed.from,
      to: parsed.to,
    });
    return this.buildCustomPreviewResponse(parsed, report);
  }
}
