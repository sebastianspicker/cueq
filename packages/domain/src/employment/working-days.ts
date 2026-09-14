import { parseDateOnly } from '../calendar/date-parsing.js';

export interface AssignmentWorkingDaysInput {
  startDate: string;
  endDate: string;
  workingDays: number[];
  holidayDates: string[];
}

function validateWorkingDays(workingDays: number[]): Set<number> {
  for (const weekday of workingDays) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new RangeError('Working days must be ISO weekdays from 1 through 7.');
    }
  }
  return new Set(workingDays);
}

/** Count configured assignment working days across inclusive date-only endpoints. */
export function countAssignmentWorkingDays(input: AssignmentWorkingDaysInput): number {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (start > end) {
    throw new RangeError('Assignment end date must be on or after its start date.');
  }

  const workingDays = validateWorkingDays(input.workingDays);
  const holidays = new Set(
    input.holidayDates.map((holidayDate) => parseDateOnly(holidayDate).toISOString().slice(0, 10)),
  );
  let total = 0;

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const isoDate = date.toISOString().slice(0, 10);
    if (workingDays.has(isoWeekday) && !holidays.has(isoDate)) {
      total += 1;
    }
  }

  return total;
}
