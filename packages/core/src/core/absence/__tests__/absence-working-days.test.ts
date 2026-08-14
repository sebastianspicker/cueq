import { describe, expect, it } from 'vitest';
import { calculateAbsenceWorkingDays } from '../index.js';

describe('calculateAbsenceWorkingDays', () => {
  it('counts only weekdays and excludes NRW holidays', () => {
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-04-01',
      endDate: '2026-04-07',
      holidayDates: ['2026-04-03', '2026-04-06'],
    });

    expect(days).toBe(3);
  });

  it('uses an empty holiday set when no holidays are provided', () => {
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-04-01',
      endDate: '2026-04-03',
    });

    expect(days).toBe(3);
  });
});

describe('calculateAbsenceWorkingDays: edge cases', () => {
  it('returns 0 when employee starts on a holiday (single-day range)', () => {
    // 2026-01-01 is Neujahr (NRW holiday)
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      holidayDates: ['2026-01-01'],
    });

    expect(days).toBe(0);
  });

  it('excludes start date holiday but counts subsequent working days', () => {
    // Start on Neujahr (Thu), end on Friday Jan 2
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      holidayDates: ['2026-01-01'],
    });

    // Jan 1 is holiday, Jan 2 is Friday = 1 working day
    expect(days).toBe(1);
  });

  it('counts correctly when termination is on the last working day of the year', () => {
    // 2026-12-31 is Thursday. Dec 25 and 26 are holidays.
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-12-28',
      endDate: '2026-12-31',
      holidayDates: ['2026-12-25', '2026-12-26'],
    });

    // Dec 28(Mon), 29(Tue), 30(Wed), 31(Thu) = 4 weekdays, none are holidays
    expect(days).toBe(4);
  });

  it('handles start on a Saturday (weekend)', () => {
    // 2026-01-03 is Saturday
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-01-03',
      endDate: '2026-01-05', // Monday
    });

    // Sat and Sun excluded, Mon counted
    expect(days).toBe(1);
  });

  it('returns 0 for a weekend-only range', () => {
    // Sat Jan 3 to Sun Jan 4
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-01-03',
      endDate: '2026-01-04',
    });

    expect(days).toBe(0);
  });
});
