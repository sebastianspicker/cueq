import { describe, expect, it } from 'vitest';
import {
  calculateAbsenceWorkingDays,
  calculateLeaveLedger,
  calculateLeaveQuota,
  calculateProratedMonthlyTarget,
} from '..';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';

describe('calculateProratedMonthlyTarget', () => {
  it('calculates prorated monthly target for segmented work-time model', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [
        { from: '2026-04-01', to: '2026-04-14', weeklyHours: 39.83 },
        { from: '2026-04-15', to: '2026-04-30', weeklyHours: 30 },
      ],
      actualHours: 149,
      transitionAdjustmentHours: -0.33,
    });

    expect(result.proratedTargetHours).toBe(151.33);
    expect(result.deltaHours).toBe(-2.33);
    expect(result.violations).toEqual([]);
  });

  it('supports NRW holiday exclusion when provided', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-04-01', to: '2026-04-10', weeklyHours: 39.83 }],
      actualHours: 0,
      holidayDates: ['2026-04-03', '2026-04-06'],
    });

    expect(result.proratedTargetHours).toBe(47.8);
  });

  it('returns validation violations for negative segment values', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-04-01', to: '2026-04-10', weeklyHours: -5 }],
      actualHours: 0,
    });

    expect(result.violations[0]?.code).toBe('NEGATIVE_WEEKLY_HOURS');
  });

  it('throws when a segment date is malformed', () => {
    expect(() =>
      calculateProratedMonthlyTarget({
        month: '2026-04',
        segments: [{ from: 'not-a-date', to: '2026-04-10', weeklyHours: 39.83 }],
        actualHours: 0,
      }),
    ).toThrow('Invalid date');
  });
});

describe('calculateLeaveQuota', () => {
  it('applies TV-L carry-over and forfeiture deadline', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 20,
      carryOverDays: 5,
      asOfDate: '2026-04-10',
    });

    expect(result.entitlementDays).toBe(30);
    expect(result.carriedOverDays).toBe(5);
    expect(result.forfeitedDays).toBe(result.carriedOverDays);
    expect(result.remainingDays).toBe(10);
  });

  it('supports pro-rata entitlement with entry month', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      entryDate: '2026-07-01',
      usedDays: 0,
      carryOverDays: 0,
      asOfDate: '2026-12-01',
    });

    expect(result.entitlementDays).toBe(15);
  });

  it('throws when asOfDate is malformed', () => {
    expect(() =>
      calculateLeaveQuota({
        year: 2026,
        employmentFraction: 1,
        usedDays: 0,
        carryOverDays: 0,
        asOfDate: 'invalid-date',
      }),
    ).toThrow('Invalid month-day value');
  });

  it('supports pro-rata entitlement with exit month and omitted carry-over input', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      exitDate: '2026-06-15',
      usedDays: 0,
      asOfDate: '2026-03-01',
    });

    expect(result.entitlementDays).toBe(15);
    expect(result.carriedOverDays).toBe(0);
    expect(result.forfeitedDays).toBe(0);
  });

  it('forfeits carry-over when after a mid-month deadline in the same month', () => {
    const result = calculateLeaveQuota(
      {
        year: 2026,
        employmentFraction: 1,
        usedDays: 0,
        carryOverDays: 8,
        asOfDate: '2026-03-20',
      },
      {
        ...DEFAULT_LEAVE_RULE,
        carryOver: {
          ...DEFAULT_LEAVE_RULE.carryOver,
          forfeitureDeadline: '03-15',
        },
      },
    );

    expect(result.forfeitedDays).toBe(result.carriedOverDays);
  });

  it('does not forfeit carry-over when carry-over forfeiture is disabled', () => {
    const result = calculateLeaveQuota(
      {
        year: 2026,
        employmentFraction: 1,
        usedDays: 0,
        carryOverDays: 5,
        asOfDate: '2026-04-10',
      },
      {
        ...DEFAULT_LEAVE_RULE,
        carryOver: {
          ...DEFAULT_LEAVE_RULE.carryOver,
          enabled: false,
        },
      },
    );

    expect(result.forfeitedDays).toBe(0);
    expect(result.remainingDays).toBe(35);
  });
});

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

describe('calculateLeaveLedger', () => {
  it('consumes carry-over before current-year entitlement and forfeits after deadline', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 5,
        annualLeaveUsage: [
          { date: '2026-02-10', days: 2 },
          { date: '2026-04-10', days: 6 },
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverDays).toBe(5);
    expect(result.carriedOverUsedDays).toBe(2);
    expect(result.forfeitedDays).toBe(3);
    expect(result.currentYearUsedDays).toBe(6);
  });

  it('supports employment-window pro-rata and explicit adjustments', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 20,
        employmentStartDate: '2026-07-01',
        adjustments: [{ year: 2026, deltaDays: 1.5 }],
        annualLeaveUsage: [{ date: '2026-08-05', days: 1 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(7.53);
    expect(result.adjustmentsDays).toBe(1.5);
    expect(result.remainingDays).toBe(8.03);
  });

  it('does not forfeit carry-over before deadline', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-03-01',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 4,
        annualLeaveUsage: [{ date: '2026-02-14', days: 1 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.forfeitedDays).toBe(0);
    expect(result.carriedOverRemainingDays).toBe(3);
  });

  it('forfeits remaining carry-over at as-of date when deadline already passed', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-04-10T12:00:00.000Z',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 4,
        annualLeaveUsage: [{ date: '2026-02-14', days: 1 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverUsedDays).toBe(1);
    expect(result.forfeitedDays).toBe(3);
    expect(result.carriedOverRemainingDays).toBe(0);
  });

  it('keeps full-year entitlement when prorating is disabled and full-time weekly hours is omitted', () => {
    const { fullTimeWeeklyHours: _unused, ...ruleWithoutFullTime } = DEFAULT_LEAVE_RULE;
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-07-01',
      },
      {
        ...ruleWithoutFullTime,
        proRataOnEntry: false,
        proRataOnExit: false,
      } as typeof DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(30);
    expect(result.usedDays).toBe(0);
  });

  it('returns zero entitlement when employment window is inverted inside the year', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-10-01',
        employmentEndDate: '2026-02-01',
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(0);
    expect(result.remainingDays).toBe(0);
  });

  it('throws when asOfDate is malformed as ISO date time', () => {
    expect(() =>
      calculateLeaveLedger(
        {
          year: 2026,
          asOfDate: 'not-a-date',
          workTimeModelWeeklyHours: 39.83,
        },
        DEFAULT_LEAVE_RULE,
      ),
    ).toThrow('Invalid date');
  });
});
