'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { SearchInput } from '../../../components/SearchInput';
import { Pagination } from '../../../components/Pagination';
import { useApiContext } from '../../../lib/api-context';

interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
}

const PAGE_SIZE = 20;

export default function AuditPage() {
  const t = useTranslations('pages.audit');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = entries.filter((entry) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      entry.action.toLowerCase().includes(term) ||
      entry.entityType.toLowerCase().includes(term) ||
      entry.entityId.toLowerCase().includes(term) ||
      entry.actorId.toLowerCase().includes(term) ||
      (entry.reason ?? '').toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (entityType) params.set('entityType', entityType);
      const result = await apiRequest<{ entries: AuditEntry[] }>(
        `/audit?${params.toString()}`,
      );
      setEntries(result?.entries ?? []);
      setPage(1);
    } catch {
      setError(t('requestFailed'));
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
        <div className="cq-grid-3">
          <label className="cq-form-field">
            <span className="cq-form-label">{t('fromLabel')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('toLabel')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="cq-form-field">
            <span className="cq-form-label">{t('entityTypeLabel')}</span>
            <input value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          </label>
        </div>

        <button type="button" disabled={loading} onClick={() => void loadEntries()}>
          {loading ? t('loading') : t('loadEntries')}
        </button>
      </SectionCard>

      {entries.length > 0 ? (
        <SectionCard>
          <div className="cq-toolbar">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder={t('searchPlaceholder')}
            />
            <span className="cq-toolbar-spacer" />
            <span className="cq-badge cq-badge-muted">{filtered.length} entries</span>
          </div>

          <table className="cq-data-table">
            <thead>
              <tr>
                <th>{t('timestampLabel')}</th>
                <th>{t('actorLabel')}</th>
                <th>{t('actionLabel')}</th>
                <th>{t('entityLabel')}</th>
                <th>{t('entityIdLabel')}</th>
                <th>{t('reasonLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>{entry.actorId}</td>
                  <td><span className="cq-badge cq-badge-muted">{entry.action}</span></td>
                  <td>{entry.entityType}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.85rem' }}>{entry.entityId}</td>
                  <td>{entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </SectionCard>
      ) : entries.length === 0 && !loading ? (
        <SectionCard>
          <p>{t('noEntries')}</p>
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
