/** Converts closing-zone wall times and computes automatic cutoff instants. */
import { closingCutoffDay, closingCutoffHour } from './closing-config.js';
import { parseShortOffsetToMinutes } from './closing-timezone.js';

/** Returns a valid configured IANA zone or the Europe/Berlin operational default. */
function closingTimeZone(): string {
  const candidate = process.env.CLOSING_TIMEZONE?.trim() || 'Europe/Berlin';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'Europe/Berlin';
  }
}

/** @internal Resolves the UTC offset for a closing time zone. */
function resolveTimeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const zonePart = formatter.formatToParts(at).find((part) => part.type === 'timeZoneName');
  return parseShortOffsetToMinutes(zonePart?.value ?? 'UTC');
}

/** @internal Converts a wall time in the closing zone to an instant. */
function zonedDateTimeToUtcDate(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  const utcGuess = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0),
  );
  const offsetMinutes = resolveTimeZoneOffsetMinutes(utcGuess, input.timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

/** Computes the configured local cutoff in the month following the closing period. */
export function cutoffAtForPeriod(period: { periodEnd: Date }): Date {
  const day = closingCutoffDay();
  const hour = closingCutoffHour();
  const timeZone = closingTimeZone();

  const periodYear = period.periodEnd.getUTCFullYear();
  const periodMonth = period.periodEnd.getUTCMonth() + 1;
  let cutoffYear = periodYear;
  let cutoffMonth = periodMonth + 1;
  if (cutoffMonth > 12) {
    cutoffMonth = 1;
    cutoffYear += 1;
  }

  const maxDay = new Date(Date.UTC(cutoffYear, cutoffMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);

  return zonedDateTimeToUtcDate({
    year: cutoffYear,
    month: cutoffMonth,
    day: clampedDay,
    hour,
    minute: 0,
    timeZone,
  });
}
