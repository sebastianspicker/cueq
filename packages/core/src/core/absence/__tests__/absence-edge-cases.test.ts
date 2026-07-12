import { describe, expect, it } from 'vitest';
import {
  calculateAbsenceWorkingDays,
  calculateLeaveLedger,
  calculateLeaveQuota,
  calculateProratedMonthlyTarget,
} from '..';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';

// ────────────────────────────────────────────────────────────────────────────
// Leap-year edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('calculateAbsenceWorkingDays — leap year February 29', () => {
  it('counts February 29 as a working day when it falls on a weekday', () => {
    // 2016-02-29 is a Monday
    const days = calculateAbsenceWorkingDays({
      startDate: '2016-02-29',
      endDate: '2016-02-29',
    });

    expect(days).toBe(1);
  });

  it('excludes February 29 when it is declared a public holiday', () => {
    // 2016-02-29 is a Monday but marked as holiday
    const days = calculateAbsenceWorkingDays({
      startDate: '2016-02-29',
      endDate: '2016-02-29',
      holidayDates: ['2016-02-29'],
    });

    expect(days).toBe(0);
  });

  it('counts all weekdays in full leap-year February 2016 correctly', () => {
    // Feb 2016: 29 days; weekdays (Mon–Fri) = 21 (starts on Monday, ends on Monday)
    const days = calculateAbsenceWorkingDays({
      startDate: '2016-02-01',
      endDate: '2016-02-29',
    });

    expect(days).toBe(21);
  });

  it('counts all weekdays in full non-leap February 2026 correctly', () => {
    // Feb 2026: 28 days; weekdays = 20
    const days = calculateAbsenceWorkingDays({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(days).toBe(20);
  });
});

describe('calculateProratedMonthlyTarget — leap-year February', () => {
  it('includes February 29 in the working-day count for a full-month segment (2028)', () => {
    // 2028-02 is a leap-year February with 29 days.
    // 2028-02-01 is a Tuesday → weekdays: 21 (Mon/Tue/Wed/Thu/Fri × ~4 weeks + extra)
    // Let's count: Feb 1(Tue), 2(Wed), 5(Mon)..9(Fri)=5, 12..16=5, 19..23=5, 26..29=4 → 1+5+5+5+4+1=21
    const result = calculateProratedMonthlyTarget({
      month: '2028-02',
      segments: [{ from: '2028-02-01', to: '2028-02-29', weeklyHours: 39.83 }],
      actualHours: 0,
    });

    // 21 weekdays × (39.83 / 5) = 21 × 7.966 = 167.29
    expect(result.proratedTargetHours).toBe(167.29);
    expect(result.violations).toEqual([]);
  });

  it('non-leap February 2027 has one fewer working day than leap February 2028', () => {
    // 2027-02: 28 days, starts Monday → 20 weekdays
    const leap = calculateProratedMonthlyTarget({
      month: '2028-02',
      segments: [{ from: '2028-02-01', to: '2028-02-29', weeklyHours: 39.83 }],
      actualHours: 0,
    });

    const nonLeap = calculateProratedMonthlyTarget({
      month: '2027-02',
      segments: [{ from: '2027-02-01', to: '2027-02-28', weeklyHours: 39.83 }],
      actualHours: 0,
    });

    expect(leap.proratedTargetHours).toBeGreaterThan(nonLeap.proratedTargetHours);
    // Difference should be exactly one weekday's worth (7.966 hours for 39.83h/week)
    expect(Number((leap.proratedTargetHours - nonLeap.proratedTargetHours).toFixed(2))).toBeCloseTo(
      7.97,
      1,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pro-rata rounding edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('calculateLeaveLedger — pro-rata rounding', () => {
  it('rounds entitlement to two decimal places for an odd employment fraction', () => {
    // 25h/week out of 39.83h → fraction ≈ 0.62766
    // entitlement = 30 × 0.62766 = 18.83
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 25,
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(18.83);
    expect(Number.isFinite(result.entitlementDays)).toBe(true);
  });

  it('pro-rates correctly for a single-month employment window', () => {
    // Only April: 1 month → 30 × 1/12 = 2.5
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-04-30',
        workTimeModelWeeklyHours: 39.83,
        employmentStartDate: '2026-04-01',
        employmentEndDate: '2026-04-30',
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(2.5);
  });

  it('pro-rates for minimum viable employment of one month at part-time', () => {
    // November only, 20h/week
    // fraction = 20/39.83 ≈ 0.50213
    // month factor = 1/12
    // entitlement = 30 × 0.50213 × (1/12) = 1.26 (rounded to 2dp)
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-11-30',
        workTimeModelWeeklyHours: 20,
        employmentStartDate: '2026-11-01',
        employmentEndDate: '2026-11-30',
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.entitlementDays).toBe(1.26);
    expect(result.remainingDays).toBe(result.entitlementDays);
  });
});

describe('calculateLeaveQuota — pro-rata rounding', () => {
  it('handles a fractional entitlement without introducing floating-point drift', () => {
    // Mid-year entry (October): 3 months → 30 × 3/12 = 7.5 exactly
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      entryDate: '2026-10-01',
      usedDays: 0,
      asOfDate: '2026-12-31',
    });

    expect(result.entitlementDays).toBe(7.5);
    // Verify it's safe for arithmetic (no NaN, no Infinity)
    expect(Number.isFinite(result.remainingDays)).toBe(true);
  });

  it('remaining days never becomes negative when usedDays equals entitlement', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 30,
      carryOverDays: 0,
      asOfDate: '2026-12-31',
    });

    expect(result.remainingDays).toBe(0);
  });

  it('remaining days can be negative when more leave is used than available', () => {
    const result = calculateLeaveQuota({
      year: 2026,
      employmentFraction: 1,
      usedDays: 35,
      carryOverDays: 0,
      asOfDate: '2026-02-01',
    });

    // 30 (entitlement) - 35 (used) = -5
    expect(result.remainingDays).toBe(-5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-year leave usage boundary
// ────────────────────────────────────────────────────────────────────────────

describe('calculateLeaveLedger — cross-year usage filtering', () => {
  it('ignores usage entries from a prior year', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [
          { date: '2025-12-28', days: 5 },
          { date: '2026-03-10', days: 3 },
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    // Only the 2026 entry should count
    expect(result.usedDays).toBe(3);
    expect(result.remainingDays).toBe(27);
  });

  it('ignores usage entries from a future year', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-12-31',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [
          { date: '2026-06-01', days: 5 },
          { date: '2027-01-03', days: 3 },
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    // Only the 2026 entry should count
    expect(result.usedDays).toBe(5);
    expect(result.remainingDays).toBe(25);
  });

  it('ignores usage entries after asOfDate even within the same year', () => {
    const result = calculateLeaveLedger(
      {
        year: 2026,
        asOfDate: '2026-06-30',
        workTimeModelWeeklyHours: 39.83,
        annualLeaveUsage: [
          { date: '2026-05-01', days: 2 },
          { date: '2026-08-01', days: 5 }, // in the future — must be ignored
        ],
      },
      DEFAULT_LEAVE_RULE,
    );

    expect(result.usedDays).toBe(2);
    expect(result.remainingDays).toBe(28);
  });
});
