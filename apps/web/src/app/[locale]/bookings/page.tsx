'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { FormField } from '../../../components/FormField';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

interface Booking {
  id: string;
  personId: string;
  timeTypeId: string;
  timeTypeCode: string;
  timeTypeCategory: string;
  startTime: string;
  endTime: string | null;
  source: string;
  note?: string | null;
  shiftId?: string | null;
}

export default function BookingsPage() {
  const t = useTranslations('pages.bookings');
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
    if (!bookingId || !reason) {
      setError(t('requestFailed'));
      return;
    }

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
    <PageShell title={t('title')} description={t('description')}>
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

      <StatusBanner message={message} error={error} />

      <SectionCard>
        <h2>{t('correctionTitle')}</h2>
        <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <FormField label={t('bookingIdLabel')}>
            <input value={bookingId} onChange={(event) => setBookingId(event.target.value)} />
          </FormField>
          <FormField label={t('timeTypeIdLabel')}>
            <input value={timeTypeId} onChange={(event) => setTimeTypeId(event.target.value)} />
          </FormField>
          <FormField label={t('startTimeLabel')}>
            <input value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </FormField>
          <FormField label={t('endTimeLabel')}>
            <input value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </FormField>
          <FormField label={t('reasonLabel')}>
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
        </div>
        <div style={{ marginTop: '.75rem' }}>
          <button type="button" disabled={loading} onClick={() => void requestCorrection()}>
            {loading ? t('loading') : t('submitCorrection')}
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('title')}</h2>
        {bookings.length === 0 ? (
          <p>{t('noBookings')}</p>
        ) : (
          <ul style={{ display: 'grid', gap: '.5rem', paddingLeft: '1.2rem' }}>
            {bookings.map((booking) => (
              <li key={booking.id}>
                {booking.id} | {booking.timeTypeCode} | {booking.startTime} -{' '}
                {booking.endTime ?? '-'}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
