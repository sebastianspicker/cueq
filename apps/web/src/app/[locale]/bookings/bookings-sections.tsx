'use client';

import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import type { Booking } from './bookings-types';
import type { useBookingsWorkspace } from './use-bookings-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type BookingsWorkspace = ReturnType<typeof useBookingsWorkspace>;

interface BookingsWorkspaceSectionsProps {
  t: TranslationFn;
  workspace: BookingsWorkspace;
}

export function BookingsWorkspaceSections({ t, workspace }: BookingsWorkspaceSectionsProps) {
  return (
    <>
      <div className="cq-bookings-toolbar">
        <button
          type="button"
          disabled={workspace.loading}
          onClick={() => void workspace.loadBookings()}
        >
          {workspace.loading ? t('loading') : t('load')}
        </button>
      </div>

      {workspace.loading && workspace.bookings.length === 0 ? (
        <LoadingSpinner label={t('loading')} />
      ) : null}

      <StatusBanner message={workspace.message} error={workspace.error} />

      <BookingCorrectionSection
        t={t}
        loading={workspace.loading}
        bookingId={workspace.bookingId}
        timeTypeId={workspace.timeTypeId}
        startTime={workspace.startTime}
        endTime={workspace.endTime}
        reason={workspace.reason}
        fieldErrors={workspace.fieldErrors}
        onBookingIdChange={workspace.updateBookingId}
        onTimeTypeIdChange={workspace.setTimeTypeId}
        onStartTimeChange={workspace.setStartTime}
        onEndTimeChange={workspace.setEndTime}
        onReasonChange={workspace.updateReason}
        onRequestCorrection={() => void workspace.requestCorrection()}
      />

      <BookingsTableSection
        t={t}
        bookings={workspace.bookings}
        selectedBookingId={workspace.bookingId}
        onSelectBooking={workspace.updateBookingId}
      />
      {workspace.nextCursor ? (
        <button
          type="button"
          disabled={workspace.loading}
          onClick={() => void workspace.loadMore()}
        >
          {t('loadMore')}
        </button>
      ) : null}
    </>
  );
}

interface BookingCorrectionSectionProps {
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
}

function BookingCorrectionSection(props: BookingCorrectionSectionProps) {
  const {
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
  } = props;
  return (
    <section
      className="cq-booking-correction cq-ledger-section"
      aria-labelledby="cq-correction-title"
    >
      <div className="cq-ledger-section-head">
        <h2 id="cq-correction-title">{t('correctionTitle')}</h2>
      </div>
      <div className="cq-grid-2 cq-booking-correction-fields">
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
      <div className="cq-booking-correction-actions">
        <button type="button" disabled={loading} onClick={onRequestCorrection}>
          {loading ? t('loading') : t('submitCorrection')}
        </button>
      </div>
    </section>
  );
}

function BookingsTableSection({
  t,
  bookings,
  selectedBookingId,
  onSelectBooking,
}: {
  t: TranslationFn;
  bookings: Booking[];
  selectedBookingId: string;
  onSelectBooking: (bookingId: string) => void;
}) {
  return (
    <section className="cq-bookings-register cq-ledger-section" aria-labelledby="cq-bookings-title">
      <div className="cq-ledger-section-head">
        <h2 id="cq-bookings-title">{t('registerTitle')}</h2>
      </div>
      {bookings.length === 0 ? (
        <p className="cq-ledger-empty">{t('noBookings')}</p>
      ) : (
        <div className="cq-table-scroll">
          <table className="cq-data-table cq-bookings-table">
            <caption className="cq-sr-only">{t('registerTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('bookingIdColumn')}</th>
                <th scope="col">{t('timeTypeColumn')}</th>
                <th scope="col">{t('startTimeColumn')}</th>
                <th scope="col">{t('endTimeColumn')}</th>
                <th scope="col">
                  <span className="cq-sr-only">{t('actionColumn')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} data-selected={booking.id === selectedBookingId || undefined}>
                  <td className="cq-mono">{booking.id}</td>
                  <td>
                    <StatusBadge
                      status={booking.timeTypeCode}
                      variant="info"
                      label={booking.timeTypeCode}
                    />
                  </td>
                  <td>{booking.startTime}</td>
                  <td>{booking.endTime ?? '-'}</td>
                  <td className="cq-bookings-table-action">
                    <button
                      type="button"
                      className="cq-btn-ghost cq-btn-sm"
                      aria-pressed={booking.id === selectedBookingId}
                      onClick={() => onSelectBooking(booking.id)}
                    >
                      {t('correctionTitle')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
