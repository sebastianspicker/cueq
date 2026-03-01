'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

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

export default function ReportsPage() {
  const t = useTranslations('pages.reports');
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
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

  const baseUrl = useMemo(() => apiBaseUrl.replace(/\/$/, ''), [apiBaseUrl]);

  async function apiRequest<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : (null as T);

    if (!response.ok) {
      throw new Error(`${response.status}: ${text || t('requestFailed')}`);
    }

    return data;
  }

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

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <p
        style={{
          marginTop: '0.25rem',
          padding: '.75rem',
          border: '1px solid #d0d7de',
          borderRadius: '.5rem',
          backgroundColor: '#f8fafc',
        }}
      >
        {t('privacyNotice')}
      </p>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('apiBaseLabel')}</span>
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('tokenLabel')}</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="mock.eyJzdWIiOiJjLi4uIn0"
            />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('fromLabel')}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('toLabel')}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '.25rem', gridColumn: '1 / -1' }}>
            <span>{t('organizationUnitIdLabel')}</span>
            <input
              value={organizationUnitId}
              onChange={(event) => setOrganizationUnitId(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          style={{ marginTop: '.75rem' }}
          disabled={loading}
          onClick={() => void loadReports()}
        >
          {loading ? t('loading') : t('loadReports')}
        </button>
      </article>

      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      {loaded && teamAbsence ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('teamAbsenceHeading')}</h2>
          <p>
            {t('totalsLabel')}: {teamAbsence.totals.requests} / {teamAbsence.totals.days}
          </p>
          <p>
            {t('suppressionLabel')}: {String(teamAbsence.suppression.suppressed)} (
            {teamAbsence.suppression.population})
          </p>
        </article>
      ) : null}

      {loaded && oeOvertime ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('oeOvertimeHeading')}</h2>
          <p>
            {t('totalsLabel')}: {oeOvertime.totals.people} / {oeOvertime.totals.totalOvertimeHours}
          </p>
          <p>
            {t('suppressionLabel')}: {String(oeOvertime.suppression.suppressed)} (
            {oeOvertime.suppression.population})
          </p>
        </article>
      ) : null}

      {loaded && closingCompletion ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('closingCompletionHeading')}</h2>
          <p>
            {t('totalsLabel')}: {closingCompletion.totals.periods} /{' '}
            {closingCompletion.totals.exported}
          </p>
        </article>
      ) : null}

      {loaded && auditSummary ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
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
        </article>
      ) : null}

      {loaded && complianceSummary ? (
        <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
          <h2>{t('complianceSummaryHeading')}</h2>
          <p>
            {t('totalsLabel')}: {complianceSummary.privacy.reportAccesses} /{' '}
            {complianceSummary.closing.periods}
          </p>
          <p>
            {t('lastBackupLabel')}:{' '}
            {complianceSummary.operations.lastBackupRestoreVerifiedAt ?? '—'}
          </p>
        </article>
      ) : null}
    </section>
  );
}
