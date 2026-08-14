import { describe, expect, it } from 'vitest';
import { calculateLeaveQuota } from '../index.js';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';

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

describe('calculateLeaveQuota: mid-year pro-rata', () => {
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

describe('calculateLeaveQuota: carry-over rules', () => {
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

describe('calculateLeaveQuota: part-time', () => {
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
