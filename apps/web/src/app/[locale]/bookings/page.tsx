'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConnectionPanel } from '../../../components/ConnectionPanel';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
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

      <SectionCard>
        <h2>{t('correctionTitle')}</h2>
        <div className="cq-grid-2">
          <FormField label={t('bookingIdLabel')} required error={fieldErrors.bookingId}>
            <input
              value={bookingId}
              onChange={(event) => {
                setBookingId(event.target.value);
                setFieldErrors((current) => ({ ...current, bookingId: '' }));
              }}
              required
            />
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
          <FormField label={t('reasonLabel')} required error={fieldErrors.reason}>
            <input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setFieldErrors((current) => ({ ...current, reason: '' }));
              }}
              required
            />
          </FormField>
        </div>
        <div className="cq-space-top-sm">
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
          <table className="cq-data-table">
            <caption className="cq-sr-only">{t('title')}</caption>
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('timeTypeIdLabel')}</th>
                <th>{t('startTimeLabel')}</th>
                <th>{t('endTimeLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="cq-mono">{booking.id}</td>
                  <td>
                    <StatusBadge
                      status={booking.timeTypeCode}
                      variant="info"
                      label={booking.timeTypeCode}
                    />
                  </td>
                  <td>{booking.startTime}</td>
                  <td>{booking.endTime ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </PageShell>
  );
}
