'use client';

/** Booking correction form and booking-table sections for the employee workspace. */

import type { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import type { Booking } from './bookings-types';
import type { useBookingsWorkspace } from './use-bookings-workspace';

export type { Booking } from './bookings-types';

type TranslationFn = ReturnType<typeof useTranslations>;
type BookingsWorkspace = ReturnType<typeof useBookingsWorkspace>;

interface BookingsWorkspaceSectionsProps {
  t: TranslationFn;
  workspace: BookingsWorkspace;
}

/** Renders booking actions, feedback, correction controls, and the booking table. */
export function BookingsWorkspaceSections({ t, workspace }: BookingsWorkspaceSectionsProps) {
  return (
    <>
      <div>
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

      <BookingsTableSection t={t} bookings={workspace.bookings} />
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

/** Renders the booking-correction request fields and local validation feedback. */
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

/** Renders the current user's API-filtered booking list. */
function BookingsTableSection({ t, bookings }: { t: TranslationFn; bookings: Booking[] }) {
  return (
    <SectionCard>
      <h2>{t('title')}</h2>
      {bookings.length === 0 ? (
        <p>{t('noBookings')}</p>
      ) : (
        <table className="cq-data-table" tabIndex={0}>
          <caption className="cq-sr-only">{t('title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('bookingIdLabel')}</th>
              <th scope="col">{t('timeTypeIdLabel')}</th>
              <th scope="col">{t('startTimeLabel')}</th>
              <th scope="col">{t('endTimeLabel')}</th>
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
                <td>{booking.endTime ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
