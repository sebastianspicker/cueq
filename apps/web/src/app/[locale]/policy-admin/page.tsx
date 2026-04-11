'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface PolicyPayload {
  [key: string]: unknown;
}

interface PolicyEntry {
  id: string;
  type: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  description?: string | null;
  payload: PolicyPayload;
}

interface PolicyBundleResponse {
  asOf: string;
  policies: PolicyEntry[];
}

interface PolicyHistoryResponse {
  total: number;
  entries: PolicyEntry[];
}

export default function PolicyAdminPage() {
  const t = useTranslations('pages.policyAdmin');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const [asOf, setAsOf] = useState('2026-03-15');
  const [historyType, setHistoryType] = useState('');
  const [bundle, setBundle] = useState<PolicyBundleResponse | null>(null);
  const [history, setHistory] = useState<PolicyHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadBundle() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const query = new URLSearchParams();
      if (asOf) {
        query.set('asOf', asOf);
      }
      const data = await apiRequest<PolicyBundleResponse>(`/v1/policies?${query.toString()}`);
      setBundle(data);
      setMessage(t('bundleLoaded'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const query = new URLSearchParams();
      if (historyType) {
        query.set('type', historyType);
      }
      const qs = query.toString();
      const data = await apiRequest<PolicyHistoryResponse>(
        `/v1/policies/history${qs ? `?${qs}` : ''}`,
      );
      setHistory(data);
      setMessage(t('historyLoaded'));
    } catch (cause) {
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

      <StatusBanner message={message} error={error} />

      <SectionCard>
        <h2>{t('bundleTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('asOfLabel')}</span>
            <input value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <div className="cq-flex-end">
            <button type="button" disabled={loading} onClick={() => void loadBundle()}>
              {loading ? t('loading') : t('loadBundle')}
            </button>
          </div>
        </div>

        {bundle ? (
          <ul className="cq-list-stack cq-space-top-sm">
            {bundle.policies.map((entry) => (
              <li key={entry.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={entry.type} variant="info" label={entry.type} />
                    <strong>{entry.name}</strong>
                    <StatusBadge status={`v${entry.version}`} variant="muted" />
                  </div>
                </div>
                <div className="cq-list-item-meta">
                  <span>{t('effectiveFrom')}: {entry.effectiveFrom}</span>
                  <span>&middot;</span>
                  <span>{t('effectiveTo')}: {entry.effectiveTo ?? '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cq-space-top-sm">{t('noBundle')}</p>
        )}
      </SectionCard>

      <SectionCard>
        <h2>{t('historyTitle')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('typeFilterLabel')}</span>
            <input value={historyType} onChange={(event) => setHistoryType(event.target.value)} />
          </label>
          <div className="cq-flex-end">
            <button type="button" disabled={loading} onClick={() => void loadHistory()}>
              {loading ? t('loading') : t('loadHistory')}
            </button>
          </div>
        </div>

        {history ? (
          <ul className="cq-list-stack cq-space-top-sm">
            {history.entries.map((entry) => (
              <li key={entry.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={entry.type} variant="info" label={entry.type} />
                    <strong>{entry.name}</strong>
                    <StatusBadge status={`v${entry.version}`} variant="muted" />
                  </div>
                </div>
                <div className="cq-list-item-meta">
                  <span>{t('effectiveFrom')}: {entry.effectiveFrom}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cq-space-top-sm">{t('noHistory')}</p>
        )}
      </SectionCard>
    </PageShell>
  );
}
