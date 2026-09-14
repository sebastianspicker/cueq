import { describe, expect, it } from 'vitest';
import {
  targetHoursForBerlinDay,
  targetHoursForInterval,
} from './time-account-calculation.helper.js';

const schedule = {
  weeklyHours: 40,
  dailyTargetHours: 8,
  workingDays: [1, 2, 3, 4, 5],
  holidayCalendar: { holidayDates: ['2026-03-03'] },
};

describe('time-account schedule calculation', () => {
  it('uses UTC date-only account intervals and explicit holidays', () => {
    expect(
      targetHoursForInterval(
        schedule,
        new Date('2026-03-02T00:00:00.000Z'),
        new Date('2026-03-05T00:00:00.000Z'),
      ),
    ).toBe(16);
  });

  it('rejects partial-day target allocation without an explicit policy', () => {
    expect(() =>
      targetHoursForInterval(
        schedule,
        new Date('2026-03-02T12:00:00.000Z'),
        new Date('2026-03-03T00:00:00.000Z'),
      ),
    ).toThrow('Partial-day appointment boundaries');
  });

  it('prorates partial UTC accounting days only when the term explicitly enables it', () => {
    expect(
      targetHoursForInterval(
        { ...schedule, policyReferences: { timeAccountTargetProration: 'UTC_DAY_FRACTION' } },
        new Date('2026-03-02T12:00:00.000Z'),
        new Date('2026-03-04T06:00:00.000Z'),
      ),
    ).toBe(6);
  });

  it('uses the Berlin local date and weekday for the dashboard', () => {
    expect(targetHoursForBerlinDay(schedule, new Date('2026-03-29T12:00:00.000Z'))).toBe(0);
    expect(targetHoursForBerlinDay(schedule, new Date('2026-03-30T12:00:00.000Z'))).toBe(8);
  });
});
