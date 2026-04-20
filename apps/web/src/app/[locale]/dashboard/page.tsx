'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { ApiRequestError } from '../../../lib/api-client';

interface DashboardSummary {
  personId: string;
  modelName: string;
  todayTargetHours: number;
  currentBalanceHours: number;
  todayBookingsCount: number;
  hasFirstBooking: boolean;
  showOrientation: boolean;
  clockInTimeTypeId: string | null;
  quickActions: string[];
}

interface ClosingPeriodLockedErrorPayload {
  code?: string;
  periodEnd?: string;
}

function isClosingPeriodLockedError(
  payload: unknown,
): payload is ClosingPeriodLockedErrorPayload & {
  code: 'CLOSING_PERIOD_LOCKED';
  periodEnd: string;
} {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as ClosingPeriodLockedErrorPayload;
  return candidate.code === 'CLOSING_PERIOD_LOCKED' && typeof candidate.periodEnd === 'string';
}

export default function DashboardPage() {
  const t = useTranslations('pages.dashboard');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [overtimeHours, setOvertimeHours] = useState('2');
  const [overtimePeriodStart, setOvertimePeriodStart] = useState('2026-03-01T00:00:00.000Z');
  const [overtimePeriodEnd, setOvertimePeriodEnd] = useState('2026-03-31T23:59:59.000Z');
  const [overtimeReason, setOvertimeReason] = useState(
    'Requesting overtime approval for this period.',
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const nextSummary = await apiRequest<DashboardSummary>('/v1/dashboard/me');
      setSummary(nextSummary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function clockIn() {
    if (!summary?.clockInTimeTypeId) {
      setError(t('clockInTypeMissing'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const bookingPayload = {
        personId: summary.personId,
        timeTypeId: summary.clockInTimeTypeId,
        source: 'MANUAL',
        note: 'Dashboard quick action clock-in',
      };

      try {
        await apiRequest('/v1/bookings', {
          method: 'POST',
          body: JSON.stringify({
            ...bookingPayload,
            startTime: new Date().toISOString(),
          }),
        });
      } catch (cause) {
        if (
          cause instanceof ApiRequestError &&
          cause.status === 409 &&
          isClosingPeriodLockedError(cause.payload)
        ) {
          const retryStartTime = new Date(
            new Date(cause.payload.periodEnd).getTime() + 60_000,
          ).toISOString();
          await apiRequest('/v1/bookings', {
            method: 'POST',
            body: JSON.stringify({
              ...bookingPayload,
              startTime: retryStartTime,
            }),
          });
        } else {
          throw cause;
        }
      }

      await loadSummary();
      setMessage(t('clockInSuccess'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function requestOvertimeApproval() {
    if (!summary) {
      setError(t('loadSummaryFirst'));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/workflows/overtime-approvals', {
        method: 'POST',
        body: JSON.stringify({
          personId: summary.personId,
          periodStart: overtimePeriodStart,
          periodEnd: overtimePeriodEnd,
          overtimeHours: Number(overtimeHours),
          reason: overtimeReason,
        }),
      });
      setMessage(t('overtimeRequested'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  function formatHours(value: number): string {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

      <div>
        <button type="button" disabled={loading} onClick={() => void loadSummary()}>
          {loading ? t('loading') : t('loadSummary')}
        </button>
      </div>

      {loading && !summary ? <LoadingSpinner label={t('loading')} /> : null}

      <StatusBanner message={message} error={error} />

      {summary ? (
        <SectionCard>
          <h2>{t('summaryTitle')}</h2>
          <p>
            {t('modelName')}: {summary.modelName}
          </p>
          <div className="cq-stat-row">
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('todayTargetHours')}</span>
              <span className="cq-stat-value">{formatHours(summary.todayTargetHours)}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('currentBalanceHours')}</span>
              <span className="cq-stat-value">{formatHours(summary.currentBalanceHours)}</span>
            </div>
            <div className="cq-stat-card">
              <span className="cq-stat-label">{t('todayBookingsCount')}</span>
              <span className="cq-stat-value">{summary.todayBookingsCount}</span>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {summary?.showOrientation ? (
        <SectionCard>
          <h2>{t('orientationTitle')}</h2>
          <p>{t('orientationBody')}</p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <h2>{t('quickActionsTitle')}</h2>
        <div className="cq-inline-actions">
          <button type="button" disabled={loading || !summary} onClick={() => void clockIn()}>
            {t('clockIn')}
          </button>
          <Link href={`/${locale}/leave`}>{t('requestLeave')}</Link>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('overtimeTitle')}</h2>
        <div className="cq-grid-2">
          <FormField label={t('overtimeHours')} required>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={overtimeHours}
              onChange={(event) => setOvertimeHours(event.target.value)}
              required
            />
          </FormField>
          <FormField label={t('overtimeReason')} required>
            <input
              value={overtimeReason}
              onChange={(event) => setOvertimeReason(event.target.value)}
              required
            />
          </FormField>
          <FormField label={t('overtimePeriodStart')} required>
            <input
              type="datetime-local"
              value={overtimePeriodStart.slice(0, 16)}
              onChange={(event) =>
                setOvertimePeriodStart(new Date(event.target.value).toISOString())
              }
              required
            />
          </FormField>
          <FormField label={t('overtimePeriodEnd')} required>
            <input
              type="datetime-local"
              value={overtimePeriodEnd.slice(0, 16)}
              onChange={(event) => setOvertimePeriodEnd(new Date(event.target.value).toISOString())}
              required
            />
          </FormField>
        </div>
        <div className="cq-space-top-sm">
          <button
            type="button"
            disabled={loading || !summary}
            onClick={() => void requestOvertimeApproval()}
          >
            {t('requestOvertime')}
          </button>
        </div>
      </SectionCard>
    </PageShell>
  );
}
