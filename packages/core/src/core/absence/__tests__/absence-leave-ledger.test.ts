import { describe, expect, it } from 'vitest';
import { calculateLeaveLedger } from '../index.js';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';

describe('calculateLeaveLedger: mid-year pro-rata', () => {
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

describe('calculateLeaveLedger: TV-L carry-over rules', () => {
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
    // Actually asOf is exactly equal to deadline: not strictly greater: so no forfeiture
    expect(result.carriedOverUsedDays).toBe(3);
    expect(result.carriedOverRemainingDays).toBe(7);
    expect(result.forfeitedDays).toBe(0);
  });

  it.each([
    ['one millisecond before', '2026-03-31T23:59:59.998Z', 0, 7],
    ['exactly at', '2026-03-31T23:59:59.999Z', 0, 7],
    ['one millisecond after', '2026-04-01T00:00:00.000Z', 7, 0],
  ])(
    'applies the carry-over deadline %s the inclusive boundary',
    (_label, asOfDate, forfeitedDays, carriedOverRemainingDays) => {
      const result = calculateLeaveLedger(
        {
          year: 2026,
          asOfDate,
          workTimeModelWeeklyHours: 39.83,
          priorYearCarryOverDays: 10,
          annualLeaveUsage: [{ date: '2026-02-01', days: 3 }],
        },
        DEFAULT_LEAVE_RULE,
      );

      expect(result.forfeitedDays).toBe(forfeitedDays);
      expect(result.carriedOverRemainingDays).toBe(carriedOverRemainingDays);
    },
  );

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

describe('calculateLeaveLedger: part-time employees', () => {
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

describe('calculateLeaveLedger: holiday/termination edge cases', () => {
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

describe('calculateLeaveLedger: empty booking periods', () => {
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
