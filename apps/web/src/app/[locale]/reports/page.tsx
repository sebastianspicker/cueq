'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface ReportSuppression {
  suppressed: boolean;
  minGroupSize: number;
  population: number;
}

interface TeamAbsenceBucket {
  type: string;
  requests: number;
  days: number;
}

interface TeamAbsenceReport {
  organizationUnitId: string;
  from: string;
  to: string;
  suppression: ReportSuppression;
  totals: {
    requests: number;
    days: number;
  };
  buckets: TeamAbsenceBucket[];
}

interface OeOvertimeReport {
  organizationUnitId: string;
  from: string;
  to: string;
  suppression: ReportSuppression;
  totals: {
    people: number;
    totalBalanceHours: number;
    totalOvertimeHours: number;
    avgBalanceHours: number;
  };
}

interface ClosingCompletionReport {
  from: string;
  to: string;
  totals: {
    periods: number;
    exported: number;
    approved: number;
    review: number;
    open: number;
    completionRate: number;
  };
}

interface AuditSummaryReport {
  from: string;
  to: string;
  totals: {
    entries: number;
    uniqueActors: number;
    reportAccesses: number;
    exportsTriggered: number;
    lockBlocks: number;
  };
  byAction: Array<{ action: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
}

interface ComplianceSummaryReport {
  from: string;
  to: string;
  privacy: {
    minGroupSize: number;
    reportAccesses: number;
    suppressedReportAccesses: number;
    suppressionRate: number;
  };
  closing: {
    periods: number;
    exported: number;
    completionRate: number;
    lockBlocks: number;
    postCloseCorrections: number;
  };
  payrollExport: {
    runs: number;
    uniqueChecksums: number;
    duplicateChecksums: number;
    lastRunAt: string | null;
  };
  operations: {
    lastBackupRestoreVerifiedAt: string | null;
  };
}

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

export default function ReportsPage() {
  const t = useTranslations('pages.reports');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
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
    try {
      const [team, overtime, closing, audit, compliance] = await Promise.all([
        apiRequest<TeamAbsenceReport>(`/v1/reports/team-absence?${buildQuery(true)}`),
        apiRequest<OeOvertimeReport>(`/v1/reports/oe-overtime?${buildQuery(true)}`),
        apiRequest<ClosingCompletionReport>(`/v1/reports/closing-completion?${buildQuery(false)}`),
        apiRequest<AuditSummaryReport>(`/v1/reports/audit-summary?${buildQuery(false)}`),
        apiRequest<ComplianceSummaryReport>(`/v1/reports/compliance-summary?${buildQuery(false)}`),
      ]);

      setTeamAbsence(team);
      setOeOvertime(overtime);
      setClosingCompletion(closing);
      setAuditSummary(audit);
      setComplianceSummary(compliance);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomOptions() {
    setLoading(true);
    setError(null);
    try {
      const options = await apiRequest<CustomReportOptions>('/v1/reports/custom/options');
      setCustomOptions(options);
      if (options.reportTypes[0]) {
        setCustomType(options.reportTypes[0]);
      }
      if (options.groupBy[0]) {
        setCustomGroupBy(options.groupBy[0]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomPreview() {
    setLoading(true);
    setError(null);
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

      const preview = await apiRequest<CustomReportPreview>(`/v1/reports/custom/preview?${params}`);
      setCustomPreview(preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')}>
      <p className="cq-privacy-notice">{t('privacyNotice')}</p>

      <SectionCard>
        <div className="cq-grid-2">
          <ConnectionPanel
            apiBaseLabel={t('apiBaseLabel')}
            tokenLabel={t('tokenLabel')}
            apiBaseUrl={apiBaseUrl}
            setApiBaseUrl={setApiBaseUrl}
            token={token}
            setToken={setToken}
          />
          <label className="cq-form-field">
            <span>{t('fromLabel')}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('toLabel')}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="cq-stack-xs cq-full-span">
            <span>{t('organizationUnitIdLabel')}</span>
            <input
              value={organizationUnitId}
              onChange={(event) => setOrganizationUnitId(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="cq-space-top-sm"
          disabled={loading}
          onClick={() => void loadReports()}
        >
          {loading ? t('loading') : t('loadReports')}
        </button>
      </SectionCard>

      <StatusBanner error={error} />

      {loaded && teamAbsence ? (
        <SectionCard>
          <h2>{t('teamAbsenceHeading')}</h2>
          <p>
            {t('totalsLabel')}: {teamAbsence.totals.requests} / {teamAbsence.totals.days}
          </p>
          <p>
            {t('suppressionLabel')}: {String(teamAbsence.suppression.suppressed)} (
            {teamAbsence.suppression.population})
          </p>
        </SectionCard>
      ) : null}

      {loaded && oeOvertime ? (
        <SectionCard>
          <h2>{t('oeOvertimeHeading')}</h2>
          <p>
            {t('totalsLabel')}: {oeOvertime.totals.people} / {oeOvertime.totals.totalOvertimeHours}
          </p>
          <p>
            {t('suppressionLabel')}: {String(oeOvertime.suppression.suppressed)} (
            {oeOvertime.suppression.population})
          </p>
        </SectionCard>
      ) : null}

      {loaded && closingCompletion ? (
        <SectionCard>
          <h2>{t('closingCompletionHeading')}</h2>
          <p>
            {t('totalsLabel')}: {closingCompletion.totals.periods} /{' '}
            {closingCompletion.totals.exported}
          </p>
        </SectionCard>
      ) : null}

      {loaded && auditSummary ? (
        <SectionCard>
          <h2>{t('auditSummaryHeading')}</h2>
          <p>
            {t('totalsLabel')}: {auditSummary.totals.entries} / {auditSummary.totals.uniqueActors}
          </p>
          <p>
            {t('byActionLabel')}: {auditSummary.byAction.length}
          </p>
          <p>
            {t('byEntityTypeLabel')}: {auditSummary.byEntityType.length}
          </p>
        </SectionCard>
      ) : null}

      {loaded && complianceSummary ? (
        <SectionCard>
          <h2>{t('complianceSummaryHeading')}</h2>
          <p>
            {t('totalsLabel')}: {complianceSummary.privacy.reportAccesses} /{' '}
            {complianceSummary.closing.periods}
          </p>
          <p>
            {t('lastBackupLabel')}:{' '}
            {complianceSummary.operations.lastBackupRestoreVerifiedAt ?? '—'}
          </p>
        </SectionCard>
      ) : null}

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
