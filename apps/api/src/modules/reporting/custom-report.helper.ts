import { BadRequestException } from '@nestjs/common';
import { CustomReportOptionsSchema, CustomReportPreviewQuerySchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { ReportingAnalyticsHelper } from './reporting-analytics.helper.js';

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

function selectMetrics(totals: Record<string, number>, metrics: string[]): Record<string, number> {
  const selected: Record<string, number> = {};
  for (const metric of metrics) selected[metric] = totals[metric] as number;
  return selected;
}

function buildCustomPreviewResponse(
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
        metrics: selectMetrics(report.totals, parsed.metrics),
      },
    ],
  };
}

export function customReportOptions() {
  return CustomReportOptionsSchema.parse({
    reportTypes: ['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION'],
    groupBy: ['ORGANIZATION_UNIT', 'NONE'],
    metrics: ['requests', 'days', 'people', 'totalOvertimeHours', 'completionRate', 'exported'],
  });
}

export async function customReportPreview(
  analyticsHelper: ReportingAnalyticsHelper,
  user: AuthenticatedIdentity,
  query: unknown,
) {
  const normalizedQuery =
    query && typeof query === 'object' && !Array.isArray(query)
      ? { ...(query as Record<string, unknown>) }
      : {};
  if (typeof normalizedQuery.metrics === 'string')
    normalizedQuery.metrics = [normalizedQuery.metrics];

  const parsed = CustomReportPreviewQuerySchema.parse(normalizedQuery);
  const allowedMetrics = METRIC_ALLOW_LIST[parsed.reportType];
  const disallowed = parsed.metrics.filter((metric) => !allowedMetrics?.has(metric));
  if (disallowed.length > 0) {
    throw new BadRequestException(
      `Unsupported metrics for ${parsed.reportType}: ${disallowed.join(', ')}`,
    );
  }

  if (parsed.reportType === 'TEAM_ABSENCE') {
    const report = await analyticsHelper.reportTeamAbsence(user, {
      organizationUnitId: parsed.organizationUnitId,
      from: parsed.from,
      to: parsed.to,
    });
    return buildCustomPreviewResponse(parsed, report);
  }

  if (parsed.reportType === 'OE_OVERTIME') {
    const report = await analyticsHelper.reportOeOvertime(user, {
      organizationUnitId: parsed.organizationUnitId,
      from: parsed.from,
      to: parsed.to,
    });
    return buildCustomPreviewResponse(parsed, report);
  }

  if (
    parsed.reportType === 'CLOSING_COMPLETION' &&
    parsed.groupBy === 'ORGANIZATION_UNIT' &&
    !parsed.organizationUnitId
  ) {
    throw new BadRequestException(
      'CLOSING_COMPLETION grouped by ORGANIZATION_UNIT requires organizationUnitId.',
    );
  }

  const report = await analyticsHelper.reportClosingCompletion(user, {
    organizationUnitId: parsed.organizationUnitId,
    from: parsed.from,
    to: parsed.to,
  });
  return buildCustomPreviewResponse(parsed, report);
}
