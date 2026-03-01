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
    <section style={{ display: 'grid', gap: '1rem' }}>
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

      <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <label style={{ display: 'grid', gap: '.25rem' }}>
          <span>{t('startLabel')}</span>
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: '.25rem' }}>
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
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p>{t('noEntries')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: '.75rem', padding: 0, listStyle: 'none' }}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              style={{ border: '1px solid #d0d7de', borderRadius: '.5rem', padding: '.75rem' }}
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
