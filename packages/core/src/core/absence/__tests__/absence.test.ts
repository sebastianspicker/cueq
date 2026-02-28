import { describe, expect, it } from 'vitest';
import { calculateLeaveQuota, calculateProratedMonthlyTarget } from '..';

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
    expect(result.forfeitedDays).toBe(5);
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
});
