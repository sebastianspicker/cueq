'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { getStoredPreference, PAGE_SIZE_STORAGE_KEY } from '../../../lib/preferences';
import type { AuditEntriesResult, AuditEntryItem } from '@cueq/shared';

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

  // Entry browser state
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterActorId, setFilterActorId] = useState('');
  const [filterEntityId, setFilterEntityId] = useState('');
  const [entries, setEntries] = useState<AuditEntryItem[]>([]);
  const [entriesTotal, setEntriesTotal] = useState<number | null>(null);
  const [entriesSkip, setEntriesSkip] = useState(0);

  useEffect(() => {
    setPageSize(Number(getStoredPreference(PAGE_SIZE_STORAGE_KEY, '20')) || 20);
  }, []);

  useEffect(() => {
    setSummary(null);
    setError(null);
    setEntries([]);
    setEntriesTotal(null);
    setEntriesSkip(0);
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

  async function loadEntries(skip = 0) {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', `${from}T00:00:00.000Z`);
      if (to) params.set('to', `${to}T23:59:59.999Z`);
      if (filterAction) params.set('action', filterAction);
      if (filterEntityType) params.set('entityType', filterEntityType);
      if (filterActorId) params.set('actorId', filterActorId);
      if (filterEntityId) params.set('entityId', filterEntityId);
      params.set('skip', String(skip));
      params.set('take', String(pageSize));

      const result = await apiRequest<AuditEntriesResult>(
        `/v1/audit-entries?${params.toString()}`,
      );
      setEntries(skip === 0 ? result.items : (prev) => [...prev, ...result.items]);
      setEntriesTotal(result.total);
      setEntriesSkip(skip + result.items.length);
    } catch (cause) {
      setEntriesError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setEntriesLoading(false);
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

      {/* ── Audit Entry Browser ── */}
      <SectionCard>
        <h2>{t('browseEntriesTitle')}</h2>

        <StatusBanner error={entriesError} />

        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span className="cq-form-label">{t('actionFilterLabel')}</span>
            <input
              type="text"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              placeholder="BOOKING_CREATED"
            />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('entityTypeFilterLabel')}</span>
            <input
              type="text"
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              placeholder="Booking"
            />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('actorIdFilterLabel')}</span>
            <input
              type="text"
              value={filterActorId}
              onChange={(e) => setFilterActorId(e.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('entityIdFilterLabel')}</span>
            <input
              type="text"
              value={filterEntityId}
              onChange={(e) => setFilterEntityId(e.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={entriesLoading}
          onClick={() => {
            setEntries([]);
            setEntriesSkip(0);
            void loadEntries(0);
          }}
        >
          {entriesLoading ? t('loading') : t('loadEntries')}
        </button>

        {entriesTotal !== null && (
          <p>{t('totalEntries', { count: entriesTotal })}</p>
        )}

        {entries.length > 0 ? (
          <>
            <ul className="cq-list-stack">
              {entries.map((entry) => (
                <li key={entry.id} className="cq-list-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span>
                    <strong>{entry.action}</strong> — {entry.entityType} <code>{entry.entityId.slice(0, 8)}…</code>
                  </span>
                  <span style={{ fontSize: '0.85em', color: 'var(--cq-text-muted, #666)' }}>
                    {t('entryTimestamp')}: {new Date(entry.timestamp).toLocaleString()} &nbsp;|&nbsp;
                    {t('entryActorId')}: <code>{entry.actorId.slice(0, 8)}…</code>
                    {entry.reason ? ` | ${t('entryReason')}: ${entry.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>

            {entriesTotal !== null && entriesSkip < entriesTotal && (
              <button
                type="button"
                disabled={entriesLoading}
                onClick={() => void loadEntries(entriesSkip)}
              >
                {entriesLoading ? t('loading') : t('loadMoreEntries')}
              </button>
            )}
          </>
        ) : !entriesLoading && entriesTotal === 0 ? (
          <p>{t('noEntries')}</p>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
