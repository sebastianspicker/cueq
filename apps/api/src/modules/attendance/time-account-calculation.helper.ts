/** Deterministic account arithmetic from explicit appointment schedule snapshots. */
import { ConflictException } from '@nestjs/common';

type ScheduleTerm = {
  weeklyHours: { toNumber(): number } | number | null;
  dailyTargetHours: { toNumber(): number } | number | null;
  workingDays: number[];
  holidayCalendar: { holidayDates: string[] };
  policyReferences?: unknown;
};

type CompletedBooking = { startTime: Date; endTime: Date | null };

function numberValue(value: { toNumber(): number } | number | null): number | null {
  return value === null ? null : typeof value === 'number' ? value : value.toNumber();
}

function scheduleHours(term: ScheduleTerm): {
  workingDays: number[];
  holidays: Set<string>;
  hoursPerWorkingDay: number;
} {
  const workingDays = [...new Set(term.workingDays)];
  const dailyTarget = numberValue(term.dailyTargetHours);
  const weeklyHours = numberValue(term.weeklyHours);
  if (
    workingDays.length === 0 ||
    workingDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    (dailyTarget === null && weeklyHours === null)
  ) {
    throw new ConflictException({
      code: 'TIME_ACCOUNT_SCHEDULE_REQUIRED',
      message:
        'Appointment schedule and holiday configuration must be explicit before preparing accounts.',
    });
  }
  const hoursPerWorkingDay = dailyTarget ?? (weeklyHours as number) / workingDays.length;
  if (!Number.isFinite(hoursPerWorkingDay) || hoursPerWorkingDay < 0) {
    throw new ConflictException({
      code: 'TIME_ACCOUNT_SCHEDULE_REQUIRED',
      message:
        'Appointment schedule and holiday configuration must be explicit before preparing accounts.',
    });
  }
  return {
    workingDays,
    holidays: new Set(term.holidayCalendar.holidayDates),
    hoursPerWorkingDay,
  };
}

function isUtcDayBoundary(value: Date): boolean {
  return (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

function allowsUtcDayFraction(term: ScheduleTerm): boolean {
  return (
    typeof term.policyReferences === 'object' &&
    term.policyReferences !== null &&
    !Array.isArray(term.policyReferences) &&
    (term.policyReferences as Record<string, unknown>).timeAccountTargetProration ===
      'UTC_DAY_FRACTION'
  );
}

export function roundAccountHours(value: number): number {
  return Number(value.toFixed(2));
}

export function targetHoursForInterval(term: ScheduleTerm, from: Date, toExclusive: Date): number {
  if ((!isUtcDayBoundary(from) || !isUtcDayBoundary(toExclusive)) && !allowsUtcDayFraction(term)) {
    throw new ConflictException({
      code: 'TIME_ACCOUNT_PARTIAL_DAY_POLICY_REQUIRED',
      message: 'Partial-day appointment boundaries require an explicit target-hours policy.',
    });
  }
  const { workingDays, holidays, hoursPerWorkingDay } = scheduleHours(term);
  let target = 0;
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (day < toExclusive) {
    const nextDay = new Date(day.getTime() + 86_400_000);
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    const isoDate = day.toISOString().slice(0, 10);
    if (workingDays.includes(isoWeekday) && !holidays.has(isoDate)) {
      const coveredFrom = Math.max(from.getTime(), day.getTime());
      const coveredTo = Math.min(toExclusive.getTime(), nextDay.getTime());
      target += hoursPerWorkingDay * ((coveredTo - coveredFrom) / 86_400_000);
    }
    day.setTime(nextDay.getTime());
  }
  return roundAccountHours(target);
}

export function targetHoursForBerlinDay(term: ScheduleTerm, instant: Date): number {
  const { workingDays, holidays, hoursPerWorkingDay } = scheduleHours(term);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const isoDate = `${part('year')}-${part('month')}-${part('day')}`;
  const isoWeekday = new Map([
    ['Mon', 1],
    ['Tue', 2],
    ['Wed', 3],
    ['Thu', 4],
    ['Fri', 5],
    ['Sat', 6],
    ['Sun', 7],
  ]).get(part('weekday'));
  return isoWeekday && workingDays.includes(isoWeekday) && !holidays.has(isoDate)
    ? roundAccountHours(hoursPerWorkingDay)
    : 0;
}

export function actualHoursForInterval(
  bookings: CompletedBooking[],
  from: Date,
  toExclusive: Date,
): number {
  const milliseconds = bookings.reduce((sum, booking) => {
    if (!booking.endTime) return sum;
    const start = Math.max(from.getTime(), booking.startTime.getTime());
    const end = Math.min(toExclusive.getTime(), booking.endTime.getTime());
    return sum + Math.max(0, end - start);
  }, 0);
  return roundAccountHours(milliseconds / 3_600_000);
}
