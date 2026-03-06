'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
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
    <section className="cq-stack">
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>

      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <div className="cq-grid-2">
        <label className="cq-stack-xs">
          <span>{t('startLabel')}</span>
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className="cq-stack-xs">
          <span>{t('endLabel')}</span>
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>

      <div>
        <button type="button" disabled={loading} onClick={() => void load()}>
          {loading ? t('loading') : t('load')}
        </button>
      </div>

      {error ? (
        <p role="alert" className="cq-text-error">
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p>{t('noEntries')}</p>
      ) : (
        <ul className="cq-calendar-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="cq-list-item"
            >
              <p>
                <strong>{t('person')}:</strong> {entry.personName}
              </p>
              <p>
                <strong>{t('period')}:</strong> {entry.startDate} - {entry.endDate}
              </p>
              <p>
                <strong>{t('status')}:</strong> {entry.status}
              </p>
              <p>
                <strong>{t('visibilityStatus')}:</strong> {entry.visibilityStatus}
              </p>
              {entry.type ? (
                <p>
                  <strong>{t('type')}:</strong> {entry.type}
                </p>
              ) : null}
              {entry.note ? (
                <p>
                  <strong>{t('note')}:</strong> {entry.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
