'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';
import { BookingCorrectionSection, BookingsTableSection, type Booking } from './bookings-sections';

export default function BookingsPage() {
  const t = useTranslations('pages.bookings');
  const params = useParams<{ locale: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'de';
  const { apiBaseUrl, setApiBaseUrl, token, setToken, apiRequest } = useApiContext();

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

  async function loadBookings() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiRequest<Booking[]>('/v1/bookings/me');
      setBookings(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
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
      await apiRequest('/v1/workflows/booking-corrections', {
        method: 'POST',
        body: JSON.stringify({
          bookingId,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          timeTypeId: timeTypeId || undefined,
          reason,
        }),
      });
      await loadBookings();
      setMessage(t('correctionCreated'));
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
      <ConnectionPanel
        apiBaseLabel={t('apiBaseLabel')}
        tokenLabel={t('tokenLabel')}
        apiBaseUrl={apiBaseUrl}
        setApiBaseUrl={setApiBaseUrl}
        token={token}
        setToken={setToken}
      />

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
