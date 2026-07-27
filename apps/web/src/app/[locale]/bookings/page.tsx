'use client';

/** Booking workspace for personal entries and correction requests; API policy remains authoritative. */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookingSchema, WorkflowInstanceSchema } from '@cueq/shared';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import {
  loadAndApply,
  refreshAfterMutation,
  type RefreshResult,
} from '../../../lib/mutation-refresh';
import { BookingCorrectionSection, BookingsTableSection, type Booking } from './bookings-sections';

/** Hosts booking retrieval and correction-request mutation state. */
export default function BookingsPage() {
  const t = useTranslations('pages.bookings');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
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
    if (!bookingId) {
      nextFieldErrors.bookingId = t('bookingIdRequired');
    }
    if (!reason) {
      nextFieldErrors.reason = t('reasonRequired');
    }
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
      if (refresh.ok) {
        setMessage(t('correctionCreated'));
      } else {
        setError(t('savedRefreshFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <div>
        <button type="button" disabled={loading} onClick={() => void loadBookings()}>
          {loading ? t('loading') : t('load')}
        </button>
      </div>

      {loading && bookings.length === 0 ? <LoadingSpinner label={t('loading')} /> : null}

      <StatusBanner message={message} error={error} />

      <BookingCorrectionSection
        t={t}
        loading={loading}
        bookingId={bookingId}
        timeTypeId={timeTypeId}
        startTime={startTime}
        endTime={endTime}
        reason={reason}
        fieldErrors={fieldErrors}
        onBookingIdChange={(value) => {
          setBookingId(value);
          setFieldErrors((current) => ({ ...current, bookingId: '' }));
        }}
        onTimeTypeIdChange={setTimeTypeId}
        onStartTimeChange={setStartTime}
        onEndTimeChange={setEndTime}
        onReasonChange={(value) => {
          setReason(value);
          setFieldErrors((current) => ({ ...current, reason: '' }));
        }}
        onRequestCorrection={() => void requestCorrection()}
      />

      <BookingsTableSection t={t} bookings={bookings} />
    </PageShell>
  );
}
