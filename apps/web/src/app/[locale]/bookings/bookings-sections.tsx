'use client';

import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';

export interface Booking {
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

type TranslationFn = ReturnType<typeof useTranslations<'pages.bookings'>>;

export function BookingCorrectionSection({
  t,
  loading,
  bookingId,
  timeTypeId,
  startTime,
  endTime,
  reason,
  fieldErrors,
  onBookingIdChange,
  onTimeTypeIdChange,
  onStartTimeChange,
  onEndTimeChange,
  onReasonChange,
  onRequestCorrection,
}: {
  t: TranslationFn;
  loading: boolean;
  bookingId: string;
  timeTypeId: string;
  startTime: string;
  endTime: string;
  reason: string;
  fieldErrors: Record<string, string>;
  onBookingIdChange: (value: string) => void;
  onTimeTypeIdChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onRequestCorrection: () => void;
}) {
  return (
    <SectionCard>
      <h2>{t('correctionTitle')}</h2>
      <div className="cq-grid-2">
        <FormField label={t('bookingIdLabel')} required error={fieldErrors.bookingId}>
          <input
            value={bookingId}
            onChange={(event) => onBookingIdChange(event.target.value)}
            required
          />
        </FormField>
        <FormField label={t('timeTypeIdLabel')}>
          <input value={timeTypeId} onChange={(event) => onTimeTypeIdChange(event.target.value)} />
        </FormField>
        <FormField label={t('startTimeLabel')}>
          <input value={startTime} onChange={(event) => onStartTimeChange(event.target.value)} />
        </FormField>
        <FormField label={t('endTimeLabel')}>
          <input value={endTime} onChange={(event) => onEndTimeChange(event.target.value)} />
        </FormField>
        <FormField label={t('reasonLabel')} required error={fieldErrors.reason}>
          <input value={reason} onChange={(event) => onReasonChange(event.target.value)} required />
        </FormField>
      </div>
      <div className="cq-space-top-sm">
        <button type="button" disabled={loading} onClick={onRequestCorrection}>
          {loading ? t('loading') : t('submitCorrection')}
        </button>
      </div>
    </SectionCard>
  );
}

export function BookingsTableSection({ t, bookings }: { t: TranslationFn; bookings: Booking[] }) {
  return (
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
  );
}
