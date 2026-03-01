'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

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
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');
  const [token, setToken] = useState('');
  const [asOf, setAsOf] = useState('2026-03-15');
  const [historyType, setHistoryType] = useState('');
  const [bundle, setBundle] = useState<PolicyBundleResponse | null>(null);
  const [history, setHistory] = useState<PolicyHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      throw new Error(text || t('requestFailed'));
    }

    return data;
  }

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
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const data = await apiRequest<PolicyHistoryResponse>(`/v1/policies/history${suffix}`);
      setHistory(data);
      setMessage(t('historyLoaded'));
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

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('bundleTitle')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('asOfLabel')}</span>
            <input value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" disabled={loading} onClick={() => void loadBundle()}>
              {loading ? t('loading') : t('loadBundle')}
            </button>
          </div>
        </div>

        {bundle ? (
          <ul style={{ display: 'grid', gap: '.5rem', marginTop: '.75rem' }}>
            {bundle.policies.map((entry) => (
              <li
                key={entry.id}
                style={{ border: '1px solid #e5e7eb', borderRadius: '.5rem', padding: '.5rem' }}
              >
                <div>
                  <strong>{entry.type}</strong> | {entry.name} v{entry.version}
                </div>
                <div>
                  {t('effectiveFrom')}: {entry.effectiveFrom}
                </div>
                <div>
                  {t('effectiveTo')}: {entry.effectiveTo ?? '—'}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ marginTop: '.75rem' }}>{t('noBundle')}</p>
        )}
      </article>

      <article style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '1rem' }}>
        <h2>{t('historyTitle')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>{t('typeFilterLabel')}</span>
            <input
              value={historyType}
              onChange={(event) => setHistoryType(event.target.value)}
              placeholder="REST_RULE"
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" disabled={loading} onClick={() => void loadHistory()}>
              {loading ? t('loading') : t('loadHistory')}
            </button>
          </div>
        </div>

        {history ? (
          <ul style={{ display: 'grid', gap: '.5rem', marginTop: '.75rem' }}>
            {history.entries.map((entry) => (
              <li
                key={entry.id}
                style={{ border: '1px solid #e5e7eb', borderRadius: '.5rem', padding: '.5rem' }}
              >
                <div>
                  <strong>{entry.type}</strong> | {entry.name} v{entry.version}
                </div>
                <div>
                  {t('effectiveFrom')}: {entry.effectiveFrom}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ marginTop: '.75rem' }}>{t('noHistory')}</p>
        )}
      </article>

      {message ? <p style={{ color: '#0f766e' }}>{message}</p> : null}
      {error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
