'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface TeamCalendarEntry {
  id: string;
  personId: string;
  personName: string;
  startDate: string;
  endDate: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  visibilityStatus: 'ABSENT';
  type?: string;
  note?: string | null;
}

export default function TeamCalendarPage() {
  const t = useTranslations('pages.teamCalendar');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const [start, setStart] = useState('2026-04-01');
  const [end, setEnd] = useState('2026-04-30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TeamCalendarEntry[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ start, end });
      const data = await apiRequest<TeamCalendarEntry[]>(`/v1/calendar/team?${query.toString()}`);
      setEntries(data);
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

      <SectionCard>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('startLabel')}</span>
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="cq-form-field">
            <span>{t('endLabel')}</span>
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void load()}>
            {loading ? t('loading') : t('load')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner error={error} />

      <SectionCard>
        {entries.length === 0 ? (
          <p>{t('noEntries')}</p>
        ) : (
          <ul className="cq-calendar-list">
            {entries.map((entry) => (
              <li key={entry.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <strong>{entry.personName}</strong>
                  <div className="cq-list-item-meta">
                    <StatusBadge status={entry.status} />
                    {entry.type ? <StatusBadge status={entry.type} variant="info" label={entry.type} /> : null}
                  </div>
                </div>
                <div className="cq-list-item-meta">
                  <span>{entry.startDate} &ndash; {entry.endDate}</span>
                  <span>&middot;</span>
                  <span>{entry.visibilityStatus}</span>
                </div>
                {entry.note ? (
                  <p>{entry.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
