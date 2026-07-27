'use client';

/** Reporting workspace that renders permitted operational summaries and export results. */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AuditSummaryReportSchema,
  ClosingCompletionReportSchema,
  ComplianceSummaryReportSchema,
  CustomReportOptionsSchema,
  CustomReportPreviewSchema,
  OeOvertimeReportSchema,
  TeamAbsenceReportSchema,
} from '@cueq/shared';
import { useSessionContext } from '../../../components/AppWorkspace';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { canLoadSensitiveReportSummaries } from './report-access';
import {
  ReportResults,
  type AuditSummaryReport,
  type ClosingCompletionReport,
  type ComplianceSummaryReport,
  type OeOvertimeReport,
  type TeamAbsenceReport,
} from './report-results';

interface CustomReportOptions {
  reportTypes: string[];
  groupBy: string[];
  metrics: string[];
}

interface CustomReportPreviewRow {
  group: string;
  metrics: Record<string, number>;
}

interface CustomReportPreview {
  reportType: string;
  groupBy: string;
  from: string;
  to: string;
  rows: CustomReportPreviewRow[];
}

/** Hosts report selection, request, and privacy-aware result state. */
export default function ReportsPage() {
  const t = useTranslations('pages.reports');
  const { apiBaseUrl, token, apiRequest } = useApiContext();
  const { profile } = useSessionContext();
  const [from, setFrom] = useState('2026-03-01');
  const [to, setTo] = useState('2026-03-31');
  const [organizationUnitId, setOrganizationUnitId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [teamAbsence, setTeamAbsence] = useState<TeamAbsenceReport | null>(null);
  const [oeOvertime, setOeOvertime] = useState<OeOvertimeReport | null>(null);
  const [closingCompletion, setClosingCompletion] = useState<ClosingCompletionReport | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummaryReport | null>(null);
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummaryReport | null>(null);
  const [customOptions, setCustomOptions] = useState<CustomReportOptions | null>(null);
  const [customPreview, setCustomPreview] = useState<CustomReportPreview | null>(null);
  const [customType, setCustomType] = useState('TEAM_ABSENCE');
  const [customGroupBy, setCustomGroupBy] = useState('ORGANIZATION_UNIT');
  const [customMetrics, setCustomMetrics] = useState('requests,days');

  function resetReportState() {
    setLoaded(false);
    setTeamAbsence(null);
    setOeOvertime(null);
    setClosingCompletion(null);
    setAuditSummary(null);
    setComplianceSummary(null);
  }

  useEffect(() => {
    resetReportState();
    setCustomOptions(null);
    setCustomPreview(null);
    setError(null);
  }, [apiBaseUrl, token]);

  function buildQuery(includeOrganizationUnit: boolean): string {
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    if (includeOrganizationUnit && organizationUnitId) {
      params.set('organizationUnitId', organizationUnitId);
    }
    return params.toString();
  }

  async function loadReports() {
    setLoading(true);
    setError(null);
    resetReportState();
    try {
      const includeSensitiveSummaries = canLoadSensitiveReportSummaries(profile?.role);
      const [team, overtime, closing, audit, compliance] = await Promise.all([
        apiRequest(`/v1/reports/team-absence?${buildQuery(true)}`, TeamAbsenceReportSchema),
        apiRequest(`/v1/reports/oe-overtime?${buildQuery(true)}`, OeOvertimeReportSchema),
        apiRequest(
          `/v1/reports/closing-completion?${buildQuery(false)}`,
          ClosingCompletionReportSchema,
        ),
        includeSensitiveSummaries
          ? apiRequest(`/v1/reports/audit-summary?${buildQuery(false)}`, AuditSummaryReportSchema)
          : Promise.resolve(null),
        includeSensitiveSummaries
          ? apiRequest(
              `/v1/reports/compliance-summary?${buildQuery(false)}`,
              ComplianceSummaryReportSchema,
            )
          : Promise.resolve(null),
      ]);

      setTeamAbsence(team);
      setOeOvertime(overtime);
      setClosingCompletion(closing);
      setAuditSummary(audit);
      setComplianceSummary(compliance);
      setLoaded(true);
    } catch (cause) {
      resetReportState();
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomOptions() {
    setLoading(true);
    setError(null);
    setCustomOptions(null);
    try {
      const options = await apiRequest('/v1/reports/custom/options', CustomReportOptionsSchema);
      setCustomOptions(options);
      if (options.reportTypes[0]) {
        setCustomType(options.reportTypes[0]);
      }
      if (options.groupBy[0]) {
        setCustomGroupBy(options.groupBy[0]);
      }
    } catch (cause) {
      setCustomOptions(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomPreview() {
    setLoading(true);
    setError(null);
    setCustomPreview(null);
    try {
      const metrics = customMetrics
        .split(',')
        .map((metric) => metric.trim())
        .filter(Boolean);
      const params = new URLSearchParams();
      params.set('reportType', customType);
      params.set('groupBy', customGroupBy);
      params.set('from', from);
      params.set('to', to);
      if (organizationUnitId) {
        params.set('organizationUnitId', organizationUnitId);
      }
      for (const metric of metrics) {
        params.append('metrics', metric);
      }

      const preview = await apiRequest(
        `/v1/reports/custom/preview?${params}`,
        CustomReportPreviewSchema,
      );
      setCustomPreview(preview);
    } catch (cause) {
      setCustomPreview(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')}>
      <p className="cq-privacy-notice">{t('privacyNotice')}</p>

      <SectionCard>
        <div className="cq-grid-3">
          <label className="cq-form-field">
            <span>{t('fromLabel')}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('toLabel')}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('organizationUnitIdLabel')}</span>
            <input
              value={organizationUnitId}
              onChange={(event) => setOrganizationUnitId(event.target.value)}
            />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void loadReports()}>
            {loading ? t('loading') : t('loadReports')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner error={error} />

      <ReportResults
        t={t}
        loaded={loaded}
        teamAbsence={teamAbsence}
        oeOvertime={oeOvertime}
        closingCompletion={closingCompletion}
        auditSummary={auditSummary}
        complianceSummary={complianceSummary}
      />

      <SectionCard>
        <h2>{t('customBuilderHeading')}</h2>
        <p>{t('customBuilderDescription')}</p>
        <div className="cq-inline-actions">
          <button type="button" disabled={loading} onClick={() => void loadCustomOptions()}>
            {loading ? t('loading') : t('loadCustomOptions')}
          </button>
          <button type="button" disabled={loading} onClick={() => void loadCustomPreview()}>
            {loading ? t('loading') : t('loadCustomPreview')}
          </button>
        </div>

        <div className="cq-list-stack cq-space-top-sm">
          <label className="cq-form-field">
            <span>{t('customTypeLabel')}</span>
            <input value={customType} onChange={(event) => setCustomType(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('customGroupByLabel')}</span>
            <input
              value={customGroupBy}
              onChange={(event) => setCustomGroupBy(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('customMetricsLabel')}</span>
            <input
              value={customMetrics}
              onChange={(event) => setCustomMetrics(event.target.value)}
            />
          </label>
        </div>

        {customOptions ? (
          <p className="cq-space-top-sm">
            {t('customOptionsLoaded')}: {customOptions.reportTypes.join(', ')}
          </p>
        ) : null}

        {customPreview ? (
          <div className="cq-space-top-sm">
            <p>
              {t('customPreviewLoaded')}: {customPreview.reportType} ({customPreview.groupBy})
            </p>
            <ul>
              {customPreview.rows.map((row, index) => (
                <li key={`${row.group}-${index}`}>
                  {row.group}: {JSON.stringify(row.metrics)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
