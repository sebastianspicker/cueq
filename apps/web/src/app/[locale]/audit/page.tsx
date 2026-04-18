'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { getStoredPreference, PAGE_SIZE_STORAGE_KEY } from '../../../lib/preferences';

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

export default function AuditPage() {
  const t = useTranslations('pages.audit');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('2026-03-01');
  const [to, setTo] = useState('2026-03-31');
  const [pageSize, setPageSize] = useState(20);
  const [summary, setSummary] = useState<AuditSummaryReport | null>(null);

  useEffect(() => {
    setPageSize(Number(getStoredPreference(PAGE_SIZE_STORAGE_KEY, '20')) || 20);
  }, []);

  useEffect(() => {
    setSummary(null);
    setError(null);
  }, [apiBaseUrl, token]);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      const result = await apiRequest<AuditSummaryReport>(
        `/v1/reports/audit-summary?${params.toString()}`,
      );
      setSummary(result);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')}>
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <StatusBanner error={error} />

      <SectionCard>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span className="cq-form-label">{t('fromLabel')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('toLabel')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <button type="button" disabled={loading} onClick={() => void loadSummary()}>
          {loading ? t('loading') : t('loadSummary')}
        </button>
      </SectionCard>

      {summary ? (
        <>
          <SectionCard>
            <h2>{t('summaryTitle')}</h2>
            <p>
              {t('entriesLabel')}: {summary.totals.entries}
            </p>
            <p>
              {t('uniqueActorsLabel')}: {summary.totals.uniqueActors}
            </p>
            <p>
              {t('reportAccessesLabel')}: {summary.totals.reportAccesses}
            </p>
            <p>
              {t('exportsTriggeredLabel')}: {summary.totals.exportsTriggered}
            </p>
            <p>
              {t('lockBlocksLabel')}: {summary.totals.lockBlocks}
            </p>
          </SectionCard>

          <SectionCard>
            <h2>{t('byActionLabel')}</h2>
            <ul className="cq-list-stack">
              {summary.byAction.slice(0, pageSize).map((entry) => (
                <li key={entry.action} className="cq-list-item">
                  <strong>{entry.action}</strong>
                  <span>{entry.count}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard>
            <h2>{t('byEntityTypeLabel')}</h2>
            <ul className="cq-list-stack">
              {summary.byEntityType.slice(0, pageSize).map((entry) => (
                <li key={entry.entityType} className="cq-list-item">
                  <strong>{entry.entityType}</strong>
                  <span>{entry.count}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      ) : !loading ? (
        <SectionCard>
          <p>{t('noSummary')}</p>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
