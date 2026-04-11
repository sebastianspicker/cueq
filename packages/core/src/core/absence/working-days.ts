import { parseDateOnly, toHolidaySet } from '@cueq/shared';

export function countWeekdaysInclusive(
  from: string,
  to: string,
  holidayDates: Set<string>,
): number {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  let weekdays = 0;

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    const isoDate = date.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidayDates.has(isoDate)) {
      weekdays += 1;
    }
  }

  return weekdays;
}

export interface AbsenceWorkingDaysInput {
  startDate: string;
  endDate: string;
  holidayDates?: string[];
}

export function calculateAbsenceWorkingDays(input: AbsenceWorkingDaysInput): number {
  return countWeekdaysInclusive(input.startDate, input.endDate, toHolidaySet(input.holidayDates));
}
