'use client';

/** Owns booking retrieval, correction-workflow state, and feedback. */

import { useState } from 'react';
import { BookingSchema, WorkflowInstanceSchema } from '@cueq/shared';
import type { useTranslations } from 'next-intl';
import { useApiContext } from '../../../lib/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../lib/mutation-refresh';
import type { Booking } from './bookings-types';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Provides the state and actions consumed by the bookings route composition. */
export function useBookingsWorkspace(t: TranslationFn) {
  const { apiRequest } = useApiContext();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeTypeId, setTimeTypeId] = useState('');
  const [reason, setReason] = useState('Please correct this booking due to timestamp mismatch.');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function loadBookings(preserveFeedback = false): Promise<RefreshResult> {
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(
        () => apiRequest('/v1/bookings/me', BookingSchema.array()),
        setBookings,
      );
      if (!result.ok && !preserveFeedback) {
        setError(result.cause instanceof Error ? result.cause.message : t('requestFailed'));
      }
      return result;
    } finally {
      setLoading(false);
    }
  }

  async function requestCorrection() {
    const nextFieldErrors: Record<string, string> = {};
    if (!bookingId) nextFieldErrors.bookingId = t('bookingIdRequired');
    if (!reason) nextFieldErrors.reason = t('reasonRequired');
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const refresh = await refreshAfterMutation(
        () =>
          apiRequest('/v1/workflows/booking-corrections', WorkflowInstanceSchema, {
            method: 'POST',
            body: JSON.stringify({
              bookingId,
              startTime: startTime || undefined,
              endTime: endTime || undefined,
              timeTypeId: timeTypeId || undefined,
              reason,
            }),
          }),
        () => loadBookings(true),
      );
      if (refresh.ok) setMessage(t('correctionCreated'));
      else setError(t('savedRefreshFailed'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  function updateBookingId(value: string) {
    setBookingId(value);
    setFieldErrors((current) => ({ ...current, bookingId: '' }));
  }

  function updateReason(value: string) {
    setReason(value);
    setFieldErrors((current) => ({ ...current, reason: '' }));
  }

  return {
    loading,
    message,
    error,
    bookings,
    bookingId,
    startTime,
    endTime,
    timeTypeId,
    reason,
    fieldErrors,
    setStartTime,
    setEndTime,
    setTimeTypeId,
    loadBookings,
    requestCorrection,
    updateBookingId,
    updateReason,
  };
}
