'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { ApiRequestError } from '../../../lib/api-client';
import {
  DashboardSummarySection,
  OrientationSection,
  OvertimeSection,
  QuickActionsSection,
  type DashboardSummary,
} from './dashboard-sections';

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

      <DashboardSummarySection t={t} summary={summary} formatHours={formatHours} />
      <OrientationSection t={t} summary={summary} />
      <QuickActionsSection
        t={t}
        locale={locale}
        loading={loading}
        summary={summary}
        onClockIn={() => void clockIn()}
      />
      <OvertimeSection
        t={t}
        loading={loading}
        summary={summary}
        overtimeHours={overtimeHours}
        overtimeReason={overtimeReason}
        overtimePeriodStart={overtimePeriodStart}
        overtimePeriodEnd={overtimePeriodEnd}
        onOvertimeHoursChange={setOvertimeHours}
        onOvertimeReasonChange={setOvertimeReason}
        onOvertimePeriodStartChange={setOvertimePeriodStart}
        onOvertimePeriodEndChange={setOvertimePeriodEnd}
        onRequestOvertimeApproval={() => void requestOvertimeApproval()}
      />
    </PageShell>
  );
}
