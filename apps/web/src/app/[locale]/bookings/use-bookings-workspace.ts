'use client';

import { useState } from 'react';
import { BookingPageSchema, WorkflowInstanceSchema } from '@cueq/contracts';
import type { useTranslations } from 'next-intl';
import { mergePage, pagePath } from '../../../shared/workspace/cursor-pages';
import { useReadRequests } from '../../../shared/workspace/use-read-requests';
import { useApiContext } from '../../../platform/http/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../shared/workspace/mutation-refresh';
import type { Booking } from './bookings-types';

type TranslationFn = ReturnType<typeof useTranslations>;

export function useBookingsWorkspace(t: TranslationFn) {
  const { apiRequest } = useApiContext();
  const reads = useReadRequests(apiRequest);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeTypeId, setTimeTypeId] = useState('');
  const [reason, setReason] = useState('Please correct this booking due to timestamp mismatch.');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function loadBookings(
    preserveFeedback = false,
    cursor?: string | null,
  ): Promise<RefreshResult> {
    const read = reads.begin('loadBookings', preserveFeedback);
    const apiRequest = read.request;
    setLoading(true);
    if (!preserveFeedback) {
      setError(null);
      setMessage(null);
    }
    try {
      const result = await loadAndApply(
        () => apiRequest(pagePath('/v1/bookings/me', cursor), BookingPageSchema),
        (page) => {
          setBookings((previous) => (cursor ? mergePage(previous, page.items) : page.items));
          setNextCursor(page.nextCursor);
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

  async function requestCorrection() {
    const nextFieldErrors: Record<string, string> = {};
    if (!bookingId) nextFieldErrors.bookingId = t('bookingIdRequired');
    if (!reason) nextFieldErrors.reason = t('reasonRequired');
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});
    const operation = reads.begin('mutation');
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
              assignmentId: bookings.find((booking) => booking.id === bookingId)?.assignmentId,
              startTime: startTime || undefined,
              endTime: endTime || undefined,
              timeTypeId: timeTypeId || undefined,
              reason,
            }),
          }),
        () => loadBookings(true),
        operation.isFeedbackCurrent,
      );
      if (!operation.isFeedbackCurrent()) return;
      if (refresh.ok) setMessage(t('correctionCreated'));
      else setError(t('savedRefreshFailed'));
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
    nextCursor,
    loadMore: () => (nextCursor ? loadBookings(false, nextCursor) : Promise.resolve()),
    requestCorrection,
    updateBookingId,
    updateReason,
  };
}
