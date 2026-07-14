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
import { refreshAfterMutation, type RefreshResult } from '../../../lib/mutation-refresh';
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

interface ClosingPeriodLockedError {
  code: 'CLOSING_PERIOD_LOCKED';
  periodEnd: string;
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

  async function loadSummary(preserveFeedback = false): Promise<RefreshResult> {
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const nextSummary = await apiRequest<DashboardSummary>('/v1/dashboard/me');
      setSummary(nextSummary);
      return { ok: true };
    } catch (cause) {
      if (!preserveFeedback) {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      }
      return { ok: false, cause };
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

      const refresh = await refreshAfterMutation(
        async () => {
          await createClockInBooking(bookingPayload);
        },
        async () => {
          const result = await loadSummary(true);
          return result;
        },
      );
      if (refresh.ok) {
        setMessage(t('clockInSuccess'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function createClockInBooking(bookingPayload: {
    personId: string;
    timeTypeId: string;
    source: string;
    note: string;
  }) {
    try {
      await apiRequest('/v1/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...bookingPayload, startTime: new Date().toISOString() }),
      });
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) {
        const candidate = Object(cause.payload) as ClosingPeriodLockedErrorPayload;
        if (candidate.code === 'CLOSING_PERIOD_LOCKED' && typeof candidate.periodEnd === 'string') {
          const lockedError = candidate as ClosingPeriodLockedError;
          const retryStartTime = new Date(
            new Date(lockedError.periodEnd).getTime() + 60_000,
          ).toISOString();
          return apiRequest('/v1/bookings', {
            method: 'POST',
            body: JSON.stringify({ ...bookingPayload, startTime: retryStartTime }),
          });
        }
      }
      throw cause;
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
