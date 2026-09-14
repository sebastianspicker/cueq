'use client';

import { useState } from 'react';
import {
  BookingSchema,
  BookingPageSchema,
  ClosingPeriodLockedErrorSchema,
  DashboardSummarySchema,
  WorkflowInstanceSchema,
} from '@cueq/contracts';
import type { useTranslations } from 'next-intl';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { ApiRequestError } from '../../../platform/http/api-client';
import { mergePage, pagePath } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../shared/workspace/mutation-refresh';
import type { DashboardBooking, DashboardSummary } from './types';

type TranslationFn = ReturnType<typeof useTranslations>;

export function useDashboardWorkspace(t: TranslationFn, locale: string) {
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const session = useOptionalSessionContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [overtimeHours, setOvertimeHours] = useState('2');
  const [overtimePeriodStart, setOvertimePeriodStart] = useState('2026-03-01T00:00:00.000Z');
  const [overtimePeriodEnd, setOvertimePeriodEnd] = useState('2026-03-31T23:59:59.000Z');
  const [overtimeReason, setOvertimeReason] = useState(t('overtimeReasonDefault'));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary(preserveFeedback = false): Promise<RefreshResult> {
    const read = reads.begin('today', preserveFeedback);
    const apiRequest = read.request;
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(
        () => apiRequest('/v1/dashboard/me', DashboardSummarySchema),
        (nextSummary) => {
          setSummary(nextSummary);
          setBookings(nextSummary.todayBookings.items);
          setNextCursor(nextSummary.todayBookings.nextCursor);
        },
        read.isCurrent,
      );
      if (!read.isCurrent()) return result;
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function loadMoreBookings() {
    if (!summary || !nextCursor) return;
    const read = reads.begin('today');
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: summary.dayStart, to: summary.dayEnd });
      const page = await read.request(
        pagePath(`/v1/bookings/me?${params}`, nextCursor),
        BookingPageSchema,
      );
      if (!read.isCurrent()) return;
      setBookings((previous) => mergePage(previous, page.items));
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (read.isCurrent()) setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function createClockInBooking(bookingPayload: {
    personId: string;
    timeTypeId: string;
    source: string;
    note: string;
  }) {
    await apiRequest('/v1/bookings', BookingSchema, {
      method: 'POST',
      body: JSON.stringify({ ...bookingPayload, startTime: new Date().toISOString() }),
    });
  }

  async function clockIn() {
    if (!summary?.clockInTimeTypeId) {
      setError(t('clockInTypeMissing'));
      return;
    }

    const operation = reads.begin('mutation');
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
        async () => loadSummary(true),
        operation.isFeedbackCurrent,
      );
      if (!operation.isFeedbackCurrent()) return;
      if (refresh.ok) setMessage(t('clockInSuccess'));
      else setError(t('savedRefreshFailed'));
    } catch (cause) {
      if (!operation.isFeedbackCurrent()) return;
      const lockedError =
        cause instanceof ApiRequestError && cause.status === 409
          ? ClosingPeriodLockedErrorSchema.safeParse(cause.payload)
          : null;
      setError(
        lockedError?.success
          ? t('clockInLocked')
          : cause instanceof Error
            ? cause.message
            : t('requestFailed'),
      );
    } finally {
      if (operation.isCurrent()) {
        operation.finish();
        setLoading(reads.pending);
      }
    }
  }

  async function requestOvertimeApproval() {
    if (!summary) {
      setError(t('loadSummaryFirst'));
      return;
    }

    const operation = reads.begin('mutation');
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/v1/workflows/overtime-approvals', WorkflowInstanceSchema, {
        method: 'POST',
        body: JSON.stringify({
          personId: summary.personId,
          periodStart: overtimePeriodStart,
          periodEnd: overtimePeriodEnd,
          overtimeHours: Number(overtimeHours),
          reason: overtimeReason,
        }),
      });
      if (operation.isFeedbackCurrent()) setMessage(t('overtimeRequested'));
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

  function formatHours(value: number): string {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return {
    firstName: session?.profile?.firstName ?? null,
    summary,
    bookings,
    overtimeHours,
    overtimePeriodStart,
    overtimePeriodEnd,
    overtimeReason,
    loading,
    message,
    error,
    setOvertimeHours,
    setOvertimePeriodStart,
    setOvertimePeriodEnd,
    setOvertimeReason,
    loadSummary,
    nextCursor,
    loadMoreBookings,
    clockIn,
    requestOvertimeApproval,
    formatHours,
  };
}
