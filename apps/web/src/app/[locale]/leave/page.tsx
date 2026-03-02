'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface LeaveBalanceResponse {
  personId: string;
  year: number;
  asOfDate: string;
  entitlement: number;
  used: number;
  remaining: number;
  carriedOver: number;
  carriedOverUsed: number;
  forfeited: number;
  adjustments: number;
}

interface AbsenceResponse {
  id: string;
  personId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  note?: string | null;
}

const ABSENCE_TYPES = [
  'ANNUAL_LEAVE',
  'SICK',
  'SPECIAL_LEAVE',
  'TRAINING',
  'TRAVEL',
  'COMP_TIME',
  'FLEX_DAY',
  'UNPAID',
  'PARENTAL',
] as const;

export default function LeavePage() {
  const t = useTranslations('pages.leave');
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();
  const [year, setYear] = useState('2026');
  const [asOfDate, setAsOfDate] = useState('2026-12-31');
  const [requestType, setRequestType] = useState<(typeof ABSENCE_TYPES)[number]>('ANNUAL_LEAVE');
  const [startDate, setStartDate] = useState('2026-04-20');
  const [endDate, setEndDate] = useState('2026-04-22');
  const [note, setNote] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [balance, setBalance] = useState<LeaveBalanceResponse | null>(null);
  const [absences, setAbsences] = useState<AbsenceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolvePersonId(): Promise<string> {
    if (personId) {
      return personId;
    }

    const me = await apiRequest<{ id: string }>('/v1/me');
    setPersonId(me.id);
    return me.id;
  }

  async function loadBalance() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<LeaveBalanceResponse>(
        `/v1/leave-balance/me?year=${encodeURIComponent(year)}&asOfDate=${encodeURIComponent(asOfDate)}`,
      );
      setBalance(data);
      setMessage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadAbsences() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<AbsenceResponse[]>('/v1/absences/me');
      setAbsences(data);
      setMessage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const requesterId = await resolvePersonId();
      await apiRequest<AbsenceResponse>('/v1/absences', {
        method: 'POST',
        body: JSON.stringify({
          personId: requesterId,
          type: requestType,
          startDate,
          endDate,
          note: note || undefined,
        }),
      });
      await Promise.all([loadAbsences(), loadBalance()]);
      setMessage(t('requestCreated'));
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

      <div className="cq-grid-2">
        <label className="cq-form-field">
          <span>{t('yearLabel')}</span>
          <input value={year} onChange={(event) => setYear(event.target.value)} />
        </label>
        <label className="cq-form-field">
          <span>{t('asOfLabel')}</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </label>
      </div>

      <div className="cq-inline-actions">
        <button type="button" disabled={loading} onClick={() => void loadBalance()}>
          {loading ? t('loading') : t('loadBalance')}
        </button>
        <button type="button" disabled={loading} onClick={() => void loadAbsences()}>
          {loading ? t('loading') : t('loadAbsences')}
        </button>
      </div>

      <SectionCard>
        <h2>{t('submitRequest')}</h2>
        <div className="cq-grid-2">
          <label className="cq-form-field">
            <span>{t('requestTypeLabel')}</span>
            <select
              value={requestType}
              onChange={(event) =>
                setRequestType(event.target.value as (typeof ABSENCE_TYPES)[number])
              }
            >
              {ABSENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="cq-form-field">
            <span>{t('startDateLabel')}</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('endDateLabel')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className="cq-form-field">
            <span>{t('noteLabel')}</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void submitRequest()}>
            {loading ? t('loading') : t('submitRequest')}
          </button>
        </div>
      </SectionCard>

      <StatusBanner message={message} error={error} />

      {balance ? (
        <SectionCard>
          <h2>{t('balanceTitle')}</h2>
          <ul>
            <li>
              {t('asOfDate')}: {balance.asOfDate}
            </li>
            <li>
              {t('entitlement')}: {balance.entitlement}
            </li>
            <li>
              {t('used')}: {balance.used}
            </li>
            <li>
              {t('remaining')}: {balance.remaining}
            </li>
            <li>
              {t('carriedOver')}: {balance.carriedOver}
            </li>
            <li>
              {t('carriedOverUsed')}: {balance.carriedOverUsed}
            </li>
            <li>
              {t('forfeited')}: {balance.forfeited}
            </li>
            <li>
              {t('adjustments')}: {balance.adjustments}
            </li>
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard>
        <h2>{t('absencesTitle')}</h2>
        {absences.length === 0 ? (
          <p>{t('noAbsences')}</p>
        ) : (
          <ul>
            {absences.map((absence) => (
              <li key={absence.id}>
                {absence.startDate.slice(0, 10)} - {absence.endDate.slice(0, 10)} | {absence.type} |{' '}
                {absence.status} | {absence.days}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
