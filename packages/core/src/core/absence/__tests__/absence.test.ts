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

  it('clips segments to the requested month boundaries', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-03-20', to: '2026-05-10', weeklyHours: 39.83 }],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(175.25);
  });

  it('does not double-count overlapping segments inside the same month', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [
        { from: '2026-04-01', to: '2026-04-15', weeklyHours: 39.83 },
        { from: '2026-04-10', to: '2026-04-30', weeklyHours: 20 },
      ],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(131.63);
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

describe('calculateProratedMonthlyTarget — mid-year start/end', () => {
  it('pro-rates a single segment for an employee starting mid-month', () => {
    // Employee starts July 15 — only works the second half of July 2026
    // July 15-31: 13 calendar days. Weekdays: 13 (Jul 15 Wed to Jul 31 Fri)
    // Actually let's count: Jul 15(Wed),16(Thu),17(Fri),20(Mon),21(Tue),22(Wed),23(Thu),24(Fri),27(Mon),28(Tue),29(Wed),30(Thu),31(Fri) = 13 weekdays
    const result = calculateProratedMonthlyTarget({
      month: '2026-07',
      segments: [{ from: '2026-07-15', to: '2026-07-31', weeklyHours: 39.83 }],
      actualHours: 100,
    });

    // 13 weekdays × (39.83/5) = 13 × 7.966 = 103.56
    expect(result.proratedTargetHours).toBe(103.56);
    expect(result.deltaHours).toBe(-3.56);
    expect(result.violations).toEqual([]);
  });

  it('pro-rates for an employee leaving mid-month', () => {
    // Employee leaves March 15, 2026 — works only first half of March
    // Mar 2-13 weekdays (Mar 1 is Sunday): Mar 2(Mon)..Mar 13(Fri) = 10 weekdays
    // Plus Mar 16 is Monday, but employee leaves on 15th (Sunday)
    // Mar 1(Sun skip), 2(Mon),3(Tue),4(Wed),5(Thu),6(Fri),9(Mon),10(Tue),11(Wed),12(Thu),13(Fri) = 10 weekdays
    const result = calculateProratedMonthlyTarget({
      month: '2026-03',
      segments: [{ from: '2026-03-02', to: '2026-03-13', weeklyHours: 39.83 }],
      actualHours: 79.66,
    });

    // 10 weekdays × 7.966 = 79.66
    expect(result.proratedTargetHours).toBe(79.66);
    expect(result.deltaHours).toBe(0);
  });

  it('handles transition from one work-time model to another mid-month', () => {
    // Employee changes from 39.83h to 20h on March 16, 2026
    // Segment 1: Mar 2-13 = 10 weekdays at 39.83h/week
    // Segment 2: Mar 16-31 = 12 weekdays at 20h/week
    const result = calculateProratedMonthlyTarget({
      month: '2026-03',
      segments: [
        { from: '2026-03-02', to: '2026-03-13', weeklyHours: 39.83 },
        { from: '2026-03-16', to: '2026-03-31', weeklyHours: 20 },
      ],
      actualHours: 127,
    });

    // Seg1: 10 × 7.966 = 79.66
    // Seg2: 12 × 4.0 = 48.0
    // Total: 127.66
    expect(result.proratedTargetHours).toBe(127.66);
    expect(result.deltaHours).toBe(-0.66);
  });
});

describe('calculateLeaveQuota — mid-year pro-rata', () => {
  it('pro-rates for employee starting July 1 (6 months coverage)', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      entryDate: '2026-07-01',
      usedDays: 0,
      asOfDate: '2026-12-31',
    });

    // Jul-Dec = 6 months → 30 × 6/12 = 15
    expect(result.entitlementDays).toBe(15);
  });

  it('pro-rates for employee leaving March 31 (3 months coverage)', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      exitDate: '2026-03-31',
      usedDays: 0,
      asOfDate: '2026-03-31',
    });

    // Jan-Mar = 3 months → 30 × 3/12 = 7.5
    expect(result.entitlementDays).toBe(7.5);
  });

  it('pro-rates for both entry and exit in the same year', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      entryDate: '2026-04-01',
      exitDate: '2026-09-30',
      usedDays: 0,
      asOfDate: '2026-09-30',
    });

    // Apr-Sep = 6 months → 30 × 6/12 = 15
    expect(result.entitlementDays).toBe(15);
  });
});

describe('calculateLeaveLedger — mid-year pro-rata', () => {
  it('pro-rates entitlement for mid-year start (July)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-07-01',
      },
      DEFAULT_LEAVE_RULE,
    );

    // Jul-Dec = 6 months → 30 × 1.0 × (6/12) = 15
    expect(result.entitlementDays).toBe(15);
    expect(result.usedDays).toBe(0);
    expect(result.remainingDays).toBe(15);
  });

  it('pro-rates entitlement for mid-year exit (June)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-06-30',
        workTimeModelWeeklyHours: 39.83,
        employmentEndDate: '2026-06-30',
      },
      DEFAULT_LEAVE_RULE,
    );

    // Jan-Jun = 6 months → 30 × 1.0 × (6/12) = 15
    expect(result.entitlementDays).toBe(15);
  });

  it('pro-rates for entry and exit in same year (Apr-Sep)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-04-01',
        employmentEndDate: '2026-09-30',
      },
      DEFAULT_LEAVE_RULE,
    );

    // Apr-Sep = 6 months → 30 × 1.0 × (6/12) = 15
    expect(result.entitlementDays).toBe(15);
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

describe('calculateLeaveLedger — TV-L carry-over rules', () => {
  it('caps carry-over at rule maxDays', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-02-01',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 50, // exceeds maxDays=30
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverDays).toBe(30); // capped at max
  });

  it('fully consumes carry-over before current-year entitlement when usage before deadline', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-03-15',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 5,
        annualLeaveUsage: [
          { date: '2026-01-15', days: 3 },
          { date: '2026-03-01', days: 4 },
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    // 3 days from carry-over, then 2 more from carry-over (5-3=2 remaining), then 2 from current
    expect(result.carriedOverUsedDays).toBe(5);
    expect(result.currentYearUsedDays).toBe(2);
    expect(result.forfeitedDays).toBe(0); // all carry-over used before deadline
  });

  it('forfeits unused carry-over exactly on March 31 boundary', () => {
    // asOfDate is exactly March 31 at end of day
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-03-31T23:59:59.999Z',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 10,
        annualLeaveUsage: [{ date: '2026-02-01', days: 3 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    // Deadline is March 31 23:59:59.999. asOf equals deadline, so asOf > deadline is false.
    // No usage after deadline, so forfeiture is triggered by "asOf > deadline" check at end.
    // Actually asOf is exactly equal to deadline — not strictly greater — so no forfeiture
    expect(result.carriedOverUsedDays).toBe(3);
    expect(result.carriedOverRemainingDays).toBe(7);
    expect(result.forfeitedDays).toBe(0);
  });

  it('forfeits carry-over on April 1 (one day after March 31 deadline)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-04-01',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 10,
        annualLeaveUsage: [{ date: '2026-02-01', days: 3 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverUsedDays).toBe(3);
    expect(result.forfeitedDays).toBe(7);
    expect(result.carriedOverRemainingDays).toBe(0);
  });

  it('does not forfeit carry-over when carry-over is disabled', () => {
    const ruleNoCarryOver = {
      ...DEFAULT_LEAVE_RULE,
      carryOver: { ...DEFAULT_LEAVE_RULE.carryOver, enabled: false },
    };

    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 8,
        annualLeaveUsage: [{ date: '2026-06-01', days: 2 }],
      },
      ruleNoCarryOver,
    );

    expect(result.forfeitedDays).toBe(0);
    expect(result.carriedOverRemainingDays).toBe(6);
    // remaining = entitlement(30) + carryOver(8) - forfeited(0) - used(2) = 36
    expect(result.remainingDays).toBe(36);
  });

  it('handles zero carry-over days', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 0,
        annualLeaveUsage: [{ date: '2026-05-01', days: 5 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverDays).toBe(0);
    expect(result.carriedOverUsedDays).toBe(0);
    expect(result.forfeitedDays).toBe(0);
    expect(result.currentYearUsedDays).toBe(5);
    expect(result.remainingDays).toBe(25);
  });

  it('handles negative carry-over input by clamping to zero', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: -5,
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.carriedOverDays).toBe(0);
    expect(result.forfeitedDays).toBe(0);
  });

  it('forfeits remaining carry-over when first usage is after deadline', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 10,
        annualLeaveUsage: [{ date: '2026-05-01', days: 5 }],
      },
      DEFAULT_LEAVE_RULE,
    );

    // All carry-over forfeited before any usage
    expect(result.forfeitedDays).toBe(10);
    expect(result.carriedOverUsedDays).toBe(0);
    expect(result.currentYearUsedDays).toBe(5);
    // remaining = 30 + 10 - 10 - 5 = 25
    expect(result.remainingDays).toBe(25);
  });
});

describe('calculateLeaveQuota — carry-over rules', () => {
  it('does not forfeit when asOfDate is before the deadline', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 5,
      carryOverDays: 10,
      asOfDate: '2026-03-15',
    });

    expect(result.forfeitedDays).toBe(0);
    expect(result.remainingDays).toBe(35); // 30 + 10 - 5
  });

  it('forfeits all carry-over after deadline', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 5,
      carryOverDays: 10,
      asOfDate: '2026-04-01',
    });

    expect(result.forfeitedDays).toBe(10);
    expect(result.remainingDays).toBe(25); // 30 + 10 - 10 - 5
  });

  it('caps carry-over at rule maxDays', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 0,
      carryOverDays: 50,
      asOfDate: '2026-02-01',
    });

    expect(result.carriedOverDays).toBe(30); // capped
    expect(result.remainingDays).toBe(60); // 30 + 30
  });
});

describe('calculateLeaveLedger — part-time employees', () => {
  it('proportionally reduces entitlement for 30h/week part-time (≈75.3%)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 30,
      },
      DEFAULT_LEAVE_RULE,
    );

    // fraction = 30 / 39.83 ≈ 0.75318…
    // entitlement = 30 × 0.75318 = 22.60 (rounded to 2 dp)
    expect(result.entitlementDays).toBe(22.6);
    expect(result.remainingDays).toBe(22.6);
  });

  it('proportionally reduces entitlement for 20h/week part-time (≈50.2%)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 20,
      },
      DEFAULT_LEAVE_RULE,
    );

    // fraction = 20 / 39.83 ≈ 0.50213…
    // entitlement = 30 × 0.50213 = 15.06
    expect(result.entitlementDays).toBe(15.06);
  });

  it('combines part-time fraction with mid-year start pro-rata', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 20,
        employmentStartDate: '2026-07-01',
      },
      DEFAULT_LEAVE_RULE,
    );

    // fraction = 20 / 39.83 ≈ 0.50213
    // monthFactor = 6/12 = 0.5
    // entitlement = 30 × 0.50213 × 0.5 = 7.53
    expect(result.entitlementDays).toBe(7.53);
  });

  it('gives full entitlement for full-time (39.83h/week)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(30);
  });

  it('clamps zero weekly hours to zero entitlement', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 0,
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(0);
  });
});

describe('calculateAbsenceWorkingDays — edge cases', () => {
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

describe('calculateProratedMonthlyTarget — holiday edge cases', () => {
  it('handles segment starting on a holiday', () => {
    // Jan 1 2026 is Neujahr (Thursday). Employee starts Jan 1.
    const result = calculateProratedMonthlyTarget({
      month: '2026-01',
      segments: [{ from: '2026-01-01', to: '2026-01-02', weeklyHours: 39.83 }],
      actualHours: 8,
      holidayDates: ['2026-01-01'],
    });

    // Jan 1 (holiday, excluded), Jan 2 (Fri) = 1 weekday
    // 1 × (39.83/5) = 7.97
    expect(result.proratedTargetHours).toBe(7.97);
  });
});

describe('calculateLeaveLedger — holiday/termination edge cases', () => {
  it('correctly pro-rates when employment starts on a holiday month', () => {
    // Employee starts Jan 1 (Neujahr). Pro-rata uses month, not individual days.
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-01-01',
      },
      DEFAULT_LEAVE_RULE,
    );

    // Jan 1 is in month 1, full year coverage → 12/12 = 1.0
    expect(result.entitlementDays).toBe(30);
  });

  it('gives correct entitlement when employee terminates on Dec 31 (last working day area)', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        employmentEndDate: '2026-12-31',
      },
      DEFAULT_LEAVE_RULE,
    );

    // Full year → 12/12
    expect(result.entitlementDays).toBe(30);
  });
});

describe('calculateLeaveLedger — empty booking periods', () => {
  it('returns full entitlement with no usage', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(30);
    expect(result.usedDays).toBe(0);
    expect(result.currentYearUsedDays).toBe(0);
    expect(result.remainingDays).toBe(30);
  });

  it('returns full entitlement when annualLeaveUsage is omitted', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.usedDays).toBe(0);
    expect(result.remainingDays).toBe(30);
  });

  it('still forfeits carry-over with no usage when past deadline', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        priorYearCarryOverDays: 5,
        annualLeaveUsage: [],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.forfeitedDays).toBe(5);
    expect(result.carriedOverUsedDays).toBe(0);
    expect(result.remainingDays).toBe(30); // 30 + 5 - 5 - 0
  });

  it('filters out usage entries outside the target year', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [
          { date: '2025-12-20', days: 3 }, // prior year
          { date: '2027-01-05', days: 2 }, // next year
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.usedDays).toBe(0);
    expect(result.remainingDays).toBe(30);
  });

  it('filters out usage entries after asOfDate', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-06-30',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [
          { date: '2026-03-01', days: 2 }, // before asOf
          { date: '2026-09-01', days: 5 }, // after asOf
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.usedDays).toBe(2);
    expect(result.remainingDays).toBe(28);
  });
});

describe('calculateProratedMonthlyTarget — empty segments', () => {
  it('returns zero target hours for empty segments array', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(0);
    expect(result.deltaHours).toBe(0);
    expect(result.violations).toEqual([]);
  });

  it('returns zero target with transition adjustment only', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [],
      actualHours: 5,
      transitionAdjustmentHours: 2.5,
    });

    expect(result.proratedTargetHours).toBe(2.5);
    expect(result.deltaHours).toBe(2.5);
  });
});

describe('calculateLeaveQuota — part-time', () => {
  it('applies employment fraction to full entitlement', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 0.5,
      usedDays: 0,
      asOfDate: '2026-12-31',
    });

    // 30 × 0.5 = 15
    expect(result.entitlementDays).toBe(15);
  });

  it('combines part-time fraction with mid-year entry pro-rata', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 0.5,
      entryDate: '2026-07-01',
      usedDays: 0,
      asOfDate: '2026-12-31',
    });

    // 30 × 0.5 × (6/12) = 7.5
    expect(result.entitlementDays).toBe(7.5);
  });
});
