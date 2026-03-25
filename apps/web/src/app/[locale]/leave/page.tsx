'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
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
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
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
    <PageShell title={t('title')} description={t('description')} breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}>
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <div className="cq-grid-2">
        <FormField label={t('yearLabel')}>
          <input
            type="number"
            min={2020}
            max={2040}
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </FormField>
        <FormField label={t('asOfLabel')}>
          <input
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </FormField>
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
          <FormField label={t('requestTypeLabel')} required>
            <select
              value={requestType}
              onChange={(event) =>
                setRequestType(event.target.value as (typeof ABSENCE_TYPES)[number])
              }
              required
            >
              {ABSENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('startDateLabel')} required>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </FormField>
          <FormField label={t('endDateLabel')} required>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </FormField>
          <FormField label={t('noteLabel')}>
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
        <div className="cq-space-top-sm">
          <button type="button" disabled={loading} onClick={() => void submitRequest()}>
            {loading ? t('loading') : t('submitRequest')}
          </button>
        </div>
      </SectionCard>

      {loading && !balance && absences.length === 0 ? <LoadingSpinner label={t('loading')} /> : null}

      <StatusBanner message={message} error={error} />

      {balance ? (
        <SectionCard>
          <h2>{t('balanceTitle')}</h2>
          <div className="cq-stat-row">
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('entitlement')}</span>
              <span className="cq-stat-value">{balance.entitlement}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('used')}</span>
              <span className="cq-stat-value">{balance.used}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('remaining')}</span>
              <span className="cq-stat-value">{balance.remaining}</span>
            </div>
          </div>
          <dl className="cq-kv-grid">
            <dt>{t('asOfDate')}</dt>
            <dd>{balance.asOfDate}</dd>
            <dt>{t('carriedOver')}</dt>
            <dd>{balance.carriedOver}</dd>
            <dt>{t('carriedOverUsed')}</dt>
            <dd>{balance.carriedOverUsed}</dd>
            <dt>{t('forfeited')}</dt>
            <dd>{balance.forfeited}</dd>
            <dt>{t('adjustments')}</dt>
            <dd>{balance.adjustments}</dd>
          </dl>
        </SectionCard>
      ) : null}

      <SectionCard>
        <h2>{t('absencesTitle')}</h2>
        {absences.length === 0 ? (
          <p>{t('noAbsences')}</p>
        ) : (
          <ul className="cq-list-stack">
            {absences.map((absence) => (
              <li key={absence.id} className="cq-list-item">
                <div className="cq-list-item-header">
                  <div className="cq-list-item-meta">
                    <StatusBadge status={absence.type} variant="info" label={absence.type} />
                    <span>{absence.startDate.slice(0, 10)} &ndash; {absence.endDate.slice(0, 10)}</span>
                    <span>({absence.days}d)</span>
                  </div>
                  <StatusBadge status={absence.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
