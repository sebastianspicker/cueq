'use client';

import { useState } from 'react';
import {
  BookingSchema,
  ClosingPeriodLockedErrorSchema,
  DashboardSummarySchema,
  WorkflowInstanceSchema,
} from '@cueq/shared';
import type { useTranslations } from 'next-intl';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { useApiContext } from '../../../lib/api-context';
import { ApiRequestError } from '../../../lib/api-client-errors';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../lib/mutation-refresh';
import type { DashboardBooking, DashboardSummary } from './types';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Owns dashboard requests, mutation feedback, and local form state. */
export function useDashboardWorkspace(t: TranslationFn, locale: string) {
  const { apiRequest } = useApiContext();
  const session = useOptionalSessionContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [overtimeHours, setOvertimeHours] = useState('2');
  const [overtimePeriodStart, setOvertimePeriodStart] = useState('2026-03-01T00:00:00.000Z');
  const [overtimePeriodEnd, setOvertimePeriodEnd] = useState('2026-03-31T23:59:59.000Z');
  const [overtimeReason, setOvertimeReason] = useState(t('overtimeReasonDefault'));
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
      const result = await loadAndApply(
        () =>
          Promise.all([
            apiRequest('/v1/dashboard/me', DashboardSummarySchema),
            apiRequest('/v1/bookings/me', BookingSchema.array()),
          ]),
        ([nextSummary, nextBookings]) => {
          const dayKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Berlin',
          }).format(new Date(nextSummary.now));
          setSummary(nextSummary);
          setBookings(
            nextBookings.filter(
              (booking) =>
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Europe/Berlin',
                }).format(new Date(booking.startTime)) === dayKey,
            ),
          );
        },
      );
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
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
      );
      if (refresh.ok) setMessage(t('clockInSuccess'));
      else setError(t('savedRefreshFailed'));
    } catch (cause) {
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
    clockIn,
    requestOvertimeApproval,
    formatHours,
  };
}
