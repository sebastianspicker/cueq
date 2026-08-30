/** Parses month query values into inclusive closing-period bounds. */
import { BadRequestException } from '@nestjs/common';

/** Validates `YYYY-MM` and returns the inclusive UTC bounds used by closing queries. */
export function parseMonthToRange(month: string) {
  const [yearString, monthString] = month.split('-');
  const year = Number(yearString);
  const monthNumber = Number(monthString);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new BadRequestException('Month must be in YYYY-MM format.');
  }

  const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
  return { from, to };
}
