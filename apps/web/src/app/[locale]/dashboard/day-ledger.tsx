import Link from 'next/link';
import {
  formatTime,
  ledgerHourMarks,
  ledgerPosition,
  progressPercent,
  targetInstant,
  workedHours,
} from './day-ledger-math';
import type { DashboardBooking, DashboardSummary, TranslationFn } from './types';

export function DayLedgerSection({
  t,
  locale,
  summary,
  bookings,
  loading,
  formatHours,
  onClockIn,
}: {
  t: TranslationFn;
  locale: string;
  summary: DashboardSummary;
  bookings: DashboardBooking[];
  loading: boolean;
  formatHours: (value: number) => string;
  onClockIn: () => void;
}) {
  const worked = workedHours(summary, bookings);
  const progress = progressPercent(summary, bookings);
  const currentPosition = ledgerPosition(summary.now);
  const target = targetInstant(summary, bookings);
  const hours = ledgerHourMarks();
  const hourSpan = hours.length > 1 ? hours.length - 1 : 1;

  return (
    <article className="cq-day-stage" aria-labelledby="cq-day-ledger-title">
      <div className="cq-day-toolbar">
        <div className="cq-day-title">
          <h2 id="cq-day-ledger-title">{t('todayTitle')}</h2>
          <div className="cq-day-title-sub">
            {t('todayTargetHours')}: {formatHours(summary.todayTargetHours)} h ·{' '}
            {formatHours(worked)} h · {t('timeStatus', { time: formatTime(summary.now, locale) })}
          </div>
        </div>
        <div className="cq-day-actions">
          <Link className="cq-btn-secondary" href={`/${locale}/leave`}>
            {t('requestLeave')}
          </Link>
          <button type="button" className="cq-btn-primary" disabled={loading} onClick={onClockIn}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            {t('clockIn')}
          </button>
        </div>
      </div>

      <div className="cq-progress-strip">
        <div className="cq-progress-copy">
          <div className="cq-progress-label">
            <span>{t('progressLabel')}</span>
            <strong>
              {formatHours(worked)} / {formatHours(summary.todayTargetHours)} h
            </strong>
          </div>
          <div
            className="cq-progress-track"
            role="img"
            aria-label={`${formatHours(worked)} / ${formatHours(summary.todayTargetHours)} h`}
          >
            <div className="cq-progress-fill" style={{ width: `${progress}%` }} />
            <div className="cq-progress-now" style={{ left: `${progress}%` }} aria-hidden="true" />
          </div>
        </div>
        <div className="cq-balance-inline">
          <span className="cq-balance-k">{t('currentBalanceHours')}</span>
          <span
            className="cq-balance-v"
            data-positive={summary.currentBalanceHours >= 0 || undefined}
          >
            {summary.currentBalanceHours > 0 ? '+' : ''}
            {formatHours(summary.currentBalanceHours)} h
          </span>
        </div>
      </div>

      {bookings.length > 0 ? (
        <div className="cq-day-ledger" aria-label={t('todayTitle')}>
          <div className="cq-ledger-hours" aria-hidden="true">
            {hours.map((hour) => (
              <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
            ))}
          </div>
          <div className="cq-ledger-timeline">
            {hours.slice(1, -1).map((hour) => {
              const dayStartHour = hours[0] ?? 8;
              const top = ((hour - dayStartHour) / hourSpan) * 100;
              return (
                <div
                  key={`guide-${hour}`}
                  className="cq-ledger-hour-guide"
                  style={{ top: `${top}%` }}
                  aria-hidden="true"
                />
              );
            })}

            {bookings.map((booking) => {
              const isOpen = booking.endTime == null;
              const endValue = booking.endTime ?? summary.now;
              const start = ledgerPosition(booking.startTime);
              const end = ledgerPosition(endValue);
              const height = Math.max(end - start, 2);
              const durationHours =
                (new Date(endValue).getTime() - new Date(booking.startTime).getTime()) /
                (60 * 60 * 1000);
              const rangeLabel = `${formatTime(booking.startTime, locale)} – ${formatTime(endValue, locale)}`;

              return (
                <div
                  key={booking.id}
                  className="cq-ledger-block"
                  data-kind={isOpen ? 'open' : 'work'}
                  style={{ top: `${start}%`, height: `${height}%` }}
                >
                  <span className="cq-ledger-block-type">
                    {isOpen ? t('openBlock') : t('legendWork')}
                  </span>
                  <span className="cq-ledger-block-range">
                    {rangeLabel} · {formatHours(Math.max(0, durationHours))} h
                  </span>
                  {isOpen ? (
                    <span className="cq-ledger-block-note">
                      {t('currentTime', { time: formatTime(summary.now, locale) })}
                    </span>
                  ) : null}
                </div>
              );
            })}

            <div
              className="cq-now-line"
              style={{ top: `${currentPosition}%` }}
              data-label={t('currentTime', { time: formatTime(summary.now, locale) })}
              title={t('currentTime', { time: formatTime(summary.now, locale) })}
            >
              <span className="cq-sr-only">
                {t('currentTime', { time: formatTime(summary.now, locale) })}
              </span>
            </div>

            <span className="cq-sr-only">
              {t('targetTime', { time: formatTime(target, locale) })}
            </span>
          </div>
        </div>
      ) : (
        <p className="cq-ledger-empty">{t('noTimeline')}</p>
      )}

      <div className="cq-ledger-legend">
        <span>
          <i className="cq-ledger-swatch" data-kind="work" aria-hidden="true" />
          {t('legendWork')}
        </span>
        <span>
          <i className="cq-ledger-swatch" data-kind="open" aria-hidden="true" />
          {t('legendOpen')}
        </span>
      </div>
    </article>
  );
}
