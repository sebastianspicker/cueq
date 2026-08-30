import { describe, expect, it } from 'vitest';
import {
  calculateLeaveLedger,
  calculateLeaveQuota,
  calculateProratedMonthlyTarget,
  parseDateOnly,
  parseDateOrDateTime,
  parseIsoDateTime,
  toHolidaySet,
} from './index.js';

describe('absence calculations through the public domain API', () => {
  it.each([
    {
      name: 'excludes weekends, holidays, duplicate coverage, and out-of-month segments',
      input: {
        month: '2026-03',
        actualHours: 166,
        transitionAdjustmentHours: -2,
        holidayDates: ['2026-03-03'],
        segments: [
          { from: '2026-02-01', to: '2026-03-31', weeklyHours: 40 },
          { from: '2026-03-10', to: '2026-04-10', weeklyHours: 20 },
          { from: '2026-04-01', to: '2026-04-05', weeklyHours: 40 },
        ],
      },
      expected: { proratedTargetHours: 166, deltaHours: 0, violations: [] },
    },
    {
      name: 'reports negative segments without adding their target hours',
      input: {
        month: '2026-03',
        actualHours: 0,
        segments: [{ from: '2026-03-01', to: '2026-03-31', weeklyHours: -1 }],
      },
      expected: {
        proratedTargetHours: 0,
        deltaHours: 0,
        violations: [
          {
            code: 'NEGATIVE_WEEKLY_HOURS',
            message: 'Segment 2026-03-01 - 2026-03-31 has negative weekly hours.',
          },
        ],
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(calculateProratedMonthlyTarget(input)).toEqual(expected);
  });

  it.each([
    {
      name: 'prorates entry and exit employment and forfeits carry-over after the deadline',
      input: {
        year: 2026,
        employmentFraction: 1,
        entryDate: '2026-04-01',
        exitDate: '2026-12-31',
        usedDays: 2,
        carryOverDays: 5,
        asOfDate: '2026-04-01',
      },
      expected: {
        entitlementDays: 22.5,
        carriedOverDays: 5,
        forfeitedDays: 5,
        remainingDays: 20.5,
      },
    },
    {
      name: 'retains carry-over on the deadline itself',
      input: {
        year: 2026,
        employmentFraction: 0.5,
        usedDays: 1,
        carryOverDays: 50,
        asOfDate: '2026-03-31',
      },
      expected: { entitlementDays: 15, carriedOverDays: 30, forfeitedDays: 0, remainingDays: 44 },
    },
  ])('$name', ({ input, expected }) => {
    expect(calculateLeaveQuota(input)).toEqual(expected);
  });

  it('allocates usage to carry-over before entitlement, applies cutoff, and ignores other years', () => {
    expect(
      calculateLeaveLedger({
        year: 2026,
        asOfDate: '2026-04-01',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 5,
        annualLeaveUsage: [
          { date: '2025-12-31', days: 9 },
          { date: '2026-03-15', days: 2 },
          { date: '2026-04-01', days: 2 },
          { date: '2026-04-02', days: 2 },
        ],
        adjustments: [
          { year: 2025, deltaDays: 10 },
          { year: 2026, deltaDays: 1 },
        ],
      }),
    ).toEqual({
      entitlementDays: 30,
      carriedOverDays: 5,
      forfeitedDays: 3,
      usedDays: 4,
      carriedOverUsedDays: 2,
      carriedOverRemainingDays: 0,
      currentYearUsedDays: 2,
      adjustmentsDays: 1,
      remainingDays: 29,
    });
  });
});

describe('calendar parsing contracts exported by the domain root', () => {
  it.each([
    ['2026-02-28', '2026-02-28T00:00:00.000Z'],
    ['2024-02-29', '2024-02-29T00:00:00.000Z'],
  ])('parses valid UTC dates: %s', (input, expected) => {
    expect(parseDateOnly(input).toISOString()).toBe(expected);
    expect(parseDateOrDateTime(input).toISOString()).toBe(expected);
  });

  it.each(['2026-02-29', '2026/02/28', 'not-a-date'])('rejects invalid dates: %s', (input) => {
    expect(() => parseDateOnly(input)).toThrow('Invalid date');
  });

  it('rejects non-string date values before format detection', () => {
    expect(() => parseDateOrDateTime(['2026-02-28'])).toThrow('expected a string');
  });

  it.each([
    ['2026-03-01T08:00:00.000Z', '2026-03-01T08:00:00.000Z'],
    ['2026-03-01T09:00:00+01:00', '2026-03-01T08:00:00.000Z'],
  ])('parses offset-aware instants: %s', (input, expected) => {
    expect(parseIsoDateTime(input).toISOString()).toBe(expected);
    expect(parseDateOrDateTime(input).toISOString()).toBe(expected);
  });

  it.each(['2026-03-01 08:00:00Z', '2026-03-01T25:00:00Z', '2026-02-30T08:00:00Z'])(
    'rejects malformed instants: %s',
    (input) => {
      expect(() => parseIsoDateTime(input)).toThrow();
    },
  );

  it('normalizes optional holiday input into an independent set', () => {
    expect(toHolidaySet()).toEqual(new Set());
    expect(toHolidaySet(['2026-01-01', '2026-01-01'])).toEqual(new Set(['2026-01-01']));
  });
});
