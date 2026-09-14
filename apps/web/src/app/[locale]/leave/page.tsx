'use client';

/** Leave workspace for balances and requests; visible data and actions are server-authorized. */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AbsenceSchema,
  AbsencePageSchema,
  LeaveBalanceSchema,
  UserIdentitySchema,
  type Absence,
  type LeaveBalance,
} from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import type { ApiRequest } from '../../../platform/http/api-client';
import { mergePage, pagePath } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../shared/workspace/mutation-refresh';

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
  const absenceTypeLabels: Record<(typeof ABSENCE_TYPES)[number], string> = {
    ANNUAL_LEAVE: t('typeAnnualLeave'),
    SICK: t('typeSick'),
    SPECIAL_LEAVE: t('typeSpecialLeave'),
    TRAINING: t('typeTraining'),
    TRAVEL: t('typeTravel'),
    COMP_TIME: t('typeCompTime'),
    FLEX_DAY: t('typeFlexDay'),
    UNPAID: t('typeUnpaid'),
    PARENTAL: t('typeParental'),
  };
  const absenceStatusLabels: Record<string, string> = {
    REQUESTED: t('statusRequested'),
    APPROVED: t('statusApproved'),
    REJECTED: t('statusRejected'),
    CANCELLED: t('statusCancelled'),
  };
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const [year, setYear] = useState('2026');
  const [asOfDate, setAsOfDate] = useState('2026-12-31');
  const [requestType, setRequestType] = useState<(typeof ABSENCE_TYPES)[number]>('ANNUAL_LEAVE');
  const [startDate, setStartDate] = useState('2026-04-20');
  const [endDate, setEndDate] = useState('2026-04-22');
  const [note, setNote] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolvePersonId(): Promise<string> {
    if (personId) {
      return personId;
    }

    const read = reads.begin('person', true);
    try {
      const me = await read.request('/v1/me', UserIdentitySchema);
      if (!read.isCurrent()) throw new DOMException('Request superseded', 'AbortError');
      setPersonId(me.id);
      return me.id;
    } finally {
      read.finish();
    }
  }

  async function loadLeaveData<T>(
    resource: string,
    request: (apiRequest: ApiRequest) => Promise<T>,
    apply: (data: T) => void,
    preserveFeedback = false,
  ): Promise<RefreshResult> {
    const read = reads.begin(resource, preserveFeedback);
    if (!preserveFeedback) setLoading(true);
    if (!preserveFeedback) setError(null);
    try {
      const result = await loadAndApply(() => request(read.request), apply, read.isCurrent);
      if (read.isCurrent() && !preserveFeedback) {
        if (result.ok) setMessage(null);
        else setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (read.isCurrent()) {
        read.finish();
        if (!preserveFeedback) setLoading(reads.pending);
      }
    }
  }

  async function loadBalance(preserveFeedback = false): Promise<RefreshResult> {
    return loadLeaveData(
      'balance',
      (apiRequest) =>
        apiRequest(
          `/v1/leave-balance/me?year=${encodeURIComponent(year)}&asOfDate=${encodeURIComponent(asOfDate)}`,
          LeaveBalanceSchema,
        ),
      setBalance,
      preserveFeedback,
    );
  }

  async function loadAbsences(
    preserveFeedback = false,
    cursor?: string | null,
  ): Promise<RefreshResult> {
    return loadLeaveData(
      'absences',
      (apiRequest) => apiRequest(pagePath('/v1/absences/me', cursor), AbsencePageSchema),
      (page) => {
        setAbsences((previous) => (cursor ? mergePage(previous, page.items) : page.items));
        setNextCursor(page.nextCursor);
      },
      preserveFeedback,
    );
  }

  async function submitRequest() {
    const operation = reads.begin('mutation');
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const requesterId = await resolvePersonId();
      if (!operation.isFeedbackCurrent()) return;
      const refresh = await refreshAfterMutation(
        () =>
          apiRequest('/v1/absences', AbsenceSchema, {
            method: 'POST',
            body: JSON.stringify({
              personId: requesterId,
              type: requestType,
              startDate,
              endDate,
              note: note || undefined,
            }),
          }),
        async () => {
          const results = await Promise.all([loadAbsences(true), loadBalance(true)]);
          const failed = results.find((result) => !result.ok);
          return failed ?? { ok: true };
        },
        operation.isFeedbackCurrent,
      );
      if (!operation.isFeedbackCurrent()) return;
      if (refresh.ok) {
        setMessage(t('requestCreated'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      if (!operation.isFeedbackCurrent()) return;
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(reads.pending);
      }
    }
  }

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
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
                  {absenceTypeLabels[value]}
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

      {loading && !balance && absences.length === 0 ? (
        <LoadingSpinner label={t('loading')} />
      ) : null}

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
                    <StatusBadge
                      status={absence.type}
                      variant="info"
                      label={absenceTypeLabels[absence.type] ?? absence.type}
                    />
                    <span>
                      {absence.startDate.slice(0, 10)} &ndash; {absence.endDate.slice(0, 10)}
                    </span>
                    <span>({absence.days}d)</span>
                  </div>
                  <StatusBadge
                    status={absence.status}
                    label={absenceStatusLabels[absence.status] ?? absence.status}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {nextCursor ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadAbsences(false, nextCursor)}
          >
            {t('loadMore')}
          </button>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
