import type { DashboardBooking, DashboardSummary } from './types';

const LEDGER_START_MINUTE = 8 * 60;
const LEDGER_END_MINUTE = 17 * 60;
const LEDGER_HOUR_START = 8;
const LEDGER_HOUR_END = 17;

export function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

function minuteOfDay(value: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Berlin',
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function ledgerPosition(value: string): number {
  const span = LEDGER_END_MINUTE - LEDGER_START_MINUTE;
  return Math.min(100, Math.max(0, ((minuteOfDay(value) - LEDGER_START_MINUTE) / span) * 100));
}

function workedMilliseconds(summary: DashboardSummary, bookings: DashboardBooking[]): number {
  const now = new Date(summary.now).getTime();
  return bookings.reduce((total, booking) => {
    const start = new Date(booking.startTime).getTime();
    const end = booking.endTime ? new Date(booking.endTime).getTime() : now;
    return total + Math.max(0, end - start);
  }, 0);
}

export function workedHours(summary: DashboardSummary, bookings: DashboardBooking[]): number {
  return workedMilliseconds(summary, bookings) / (60 * 60 * 1000);
}

export function targetInstant(summary: DashboardSummary, bookings: DashboardBooking[]): string {
  const now = new Date(summary.now).getTime();
  const remainingMilliseconds = Math.max(
    0,
    summary.todayTargetHours * 60 * 60 * 1000 - workedMilliseconds(summary, bookings),
  );
  return new Date(now + remainingMilliseconds).toISOString();
}

export function progressPercent(summary: DashboardSummary, bookings: DashboardBooking[]): number {
  if (summary.todayTargetHours <= 0) {
    return 0;
  }
  return Math.min(100, (workedHours(summary, bookings) / summary.todayTargetHours) * 100);
}

export function ledgerHourMarks(): number[] {
  const hours: number[] = [];
  for (let hour = LEDGER_HOUR_START; hour <= LEDGER_HOUR_END; hour += 1) {
    hours.push(hour);
  }
  return hours;
}
