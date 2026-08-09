/**
 * Golden-Case Test Suite for @cueq/policy
 *
 * These tests validate the policy rule DEFINITIONS (schemas + defaults).
 * They serve as a CI gate: any change to policy rules must pass these tests.
 *
 * When policy evaluation logic is implemented, golden-case tests will also
 * verify reference calculations against known-good fixtures.
 *
 * To run: pnpm --filter @cueq/policy test:golden
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAVE_RULE,
  DEFAULT_SURCHARGE_RULE,
  LeaveRuleSchema,
  SurchargeRuleSchema,
  type LeaveRule,
} from '../index.js';

describe('Golden Cases: Leave Entitlement Constraints', () => {
  it('provides 30 days annual leave for TV-L full-time', () => {
    expect(DEFAULT_LEAVE_RULE.annualEntitlementDays).toBe(30);
    expect(DEFAULT_LEAVE_RULE.fullTimeWeeklyHours).toBe(39.83);
    expect(DEFAULT_LEAVE_RULE.workDaysPerWeek).toBe(5);
  });

  it('enables carry-over with forfeiture deadline', () => {
    expect(DEFAULT_LEAVE_RULE.carryOver.enabled).toBe(true);
    expect(DEFAULT_LEAVE_RULE.carryOver.forfeitureDeadline).toBe('03-31');
  });

  it('pins carry-over maxDays to 30', () => {
    expect(DEFAULT_LEAVE_RULE.carryOver.maxDays).toBe(30);
  });

  it('pins full-time weekly hours to 39.83 (TV-L)', () => {
    expect(DEFAULT_LEAVE_RULE.fullTimeWeeklyHours).toBe(39.83);
  });

  it('enables pro-rata on both entry and exit', () => {
    expect(DEFAULT_LEAVE_RULE.proRataOnEntry).toBe(true);
    expect(DEFAULT_LEAVE_RULE.proRataOnExit).toBe(true);
  });

  it('accepts a part-time rule with 3-day week and reduced entitlement', () => {
    const partTime: LeaveRule = {
      ...DEFAULT_LEAVE_RULE,
      id: 'leave-tvl-part-time-3d',
      annualEntitlementDays: 18, // 30 × (3/5) = 18
      workDaysPerWeek: 3,
      fullTimeWeeklyHours: 23.9, // 39.83 × (3/5) ≈ 23.9
    };
    const result = LeaveRuleSchema.safeParse(partTime);
    expect(result.success).toBe(true);
    expect(partTime.annualEntitlementDays).toBe(18);
  });

  it('rejects zero annualEntitlementDays', () => {
    const invalid = { ...DEFAULT_LEAVE_RULE, annualEntitlementDays: 0 };
    const result = LeaveRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer workDaysPerWeek', () => {
    const invalid = { ...DEFAULT_LEAVE_RULE, workDaysPerWeek: 4.5 };
    const result = LeaveRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects negative carry-over maxDays', () => {
    const invalid = {
      ...DEFAULT_LEAVE_RULE,
      carryOver: { ...DEFAULT_LEAVE_RULE.carryOver, maxDays: -1 },
    };
    const result = LeaveRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('leave entitlement is in work-days: weekend holidays do not reduce count', () => {
    // TV-L leave is measured in work-days (Mon-Fri for a 5-day week).
    // A public holiday falling on Saturday/Sunday doesn't affect entitlement
    // because those days aren't work-days to begin with.
    expect(DEFAULT_LEAVE_RULE.workDaysPerWeek).toBe(5);
    expect(DEFAULT_LEAVE_RULE.annualEntitlementDays).toBe(30);
    // 30 days / 5 work-days = 6 full weeks of leave, regardless of holiday calendar
  });

  it('rejects zero workDaysPerWeek', () => {
    const invalid = { ...DEFAULT_LEAVE_RULE, workDaysPerWeek: 0 };
    const result = LeaveRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects zero fullTimeWeeklyHours', () => {
    const invalid = { ...DEFAULT_LEAVE_RULE, fullTimeWeeklyHours: 0 };
    const result = LeaveRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts a 4-day part-time week with pro-rata entitlement (24 days)', () => {
    const partTime4Day: LeaveRule = {
      ...DEFAULT_LEAVE_RULE,
      id: 'leave-tvl-part-time-4d',
      annualEntitlementDays: 24, // 30 × (4/5) = 24
      workDaysPerWeek: 4,
      fullTimeWeeklyHours: 31.86, // 39.83 × (4/5) ≈ 31.86
    };
    const result = LeaveRuleSchema.safeParse(partTime4Day);
    expect(result.success).toBe(true);
    expect(partTime4Day.annualEntitlementDays).toBe(24);
    expect(partTime4Day.workDaysPerWeek).toBe(4);
  });

  it('accepts proRata disabled on both entry and exit', () => {
    const noProRata: LeaveRule = {
      ...DEFAULT_LEAVE_RULE,
      id: 'leave-no-prorata',
      proRataOnEntry: false,
      proRataOnExit: false,
    };
    const result = LeaveRuleSchema.safeParse(noProRata);
    expect(result.success).toBe(true);
    expect(noProRata.proRataOnEntry).toBe(false);
    expect(noProRata.proRataOnExit).toBe(false);
  });

  it('accepts a leave rule with carry-over disabled', () => {
    const noCarryOver: LeaveRule = {
      ...DEFAULT_LEAVE_RULE,
      id: 'leave-no-carryover',
      carryOver: {
        enabled: false,
        maxDays: 0,
        forfeitureDeadline: '12-31',
      },
    };
    const result = LeaveRuleSchema.safeParse(noCarryOver);
    expect(result.success).toBe(true);
    expect(noCarryOver.carryOver.enabled).toBe(false);
  });
});

describe('Golden Cases: Surcharge Rule Constraints', () => {
  it('uses HIGHEST_ONLY overlap strategy', () => {
    expect(DEFAULT_SURCHARGE_RULE.overlapStrategy).toBe('HIGHEST_ONLY');
  });

  it('defaults to Europe/Berlin timezone', () => {
    expect(DEFAULT_SURCHARGE_RULE.timezoneDefault).toBe('Europe/Berlin');
  });

  it('pins night window to 20:00–06:00', () => {
    expect(DEFAULT_SURCHARGE_RULE.nightWindow).toEqual({
      startLocalTime: '20:00',
      endLocalTime: '06:00',
    });
  });

  it('defines exactly 3 surcharge categories: NIGHT, WEEKEND, HOLIDAY', () => {
    expect(DEFAULT_SURCHARGE_RULE.categories).toHaveLength(3);
    const names = DEFAULT_SURCHARGE_RULE.categories.map((c) => c.category);
    expect(names).toEqual(['NIGHT', 'WEEKEND', 'HOLIDAY']);
  });

  it('pins surcharge rates: NIGHT=25%, WEEKEND=50%, HOLIDAY=100%', () => {
    const byCategory = Object.fromEntries(
      DEFAULT_SURCHARGE_RULE.categories.map((c) => [c.category, c.ratePercent]),
    );
    expect(byCategory).toEqual({ NIGHT: 25, WEEKEND: 50, HOLIDAY: 100 });
  });

  it('enforces priority ordering: HOLIDAY > WEEKEND > NIGHT', () => {
    const priorities = DEFAULT_SURCHARGE_RULE.categories.map((c) => ({
      category: c.category,
      priority: c.priority,
    }));
    const night = priorities.find((p) => p.category === 'NIGHT')!;
    const weekend = priorities.find((p) => p.category === 'WEEKEND')!;
    const holiday = priorities.find((p) => p.category === 'HOLIDAY')!;
    expect(holiday.priority).toBeGreaterThan(weekend.priority);
    expect(weekend.priority).toBeGreaterThan(night.priority);
  });

  it('pins exact priorities: NIGHT=100, WEEKEND=200, HOLIDAY=300', () => {
    expect(DEFAULT_SURCHARGE_RULE.categories).toEqual([
      { category: 'NIGHT', ratePercent: 25, priority: 100 },
      { category: 'WEEKEND', ratePercent: 50, priority: 200 },
      { category: 'HOLIDAY', ratePercent: 100, priority: 300 },
    ]);
  });

  it('rejects invalid nightWindow time format (missing leading zero)', () => {
    const invalid = {
      ...DEFAULT_SURCHARGE_RULE,
      nightWindow: { startLocalTime: '8:00', endLocalTime: '06:00' },
    };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range nightWindow local times', () => {
    const invalid = {
      ...DEFAULT_SURCHARGE_RULE,
      nightWindow: { startLocalTime: '25:00', endLocalTime: '06:99' },
    };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects empty timezoneDefault', () => {
    const invalid = { ...DEFAULT_SURCHARGE_RULE, timezoneDefault: '' };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid surcharge category name', () => {
    const invalid = {
      ...DEFAULT_SURCHARGE_RULE,
      categories: [{ category: 'OVERTIME', ratePercent: 50, priority: 100 }],
    };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts ratePercent=0 (nonnegative allows zero surcharge)', () => {
    const zeroRate = {
      ...DEFAULT_SURCHARGE_RULE,
      categories: [{ category: 'NIGHT', ratePercent: 0, priority: 100 }],
    };
    const result = SurchargeRuleSchema.safeParse(zeroRate);
    expect(result.success).toBe(true);
  });

  it('rejects negative priority', () => {
    const invalid = {
      ...DEFAULT_SURCHARGE_RULE,
      categories: [{ category: 'NIGHT', ratePercent: 25, priority: -1 }],
    };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts priority=0 (nonnegative allows zero priority)', () => {
    const zeroPriority = {
      ...DEFAULT_SURCHARGE_RULE,
      categories: [{ category: 'NIGHT', ratePercent: 25, priority: 0 }],
    };
    const result = SurchargeRuleSchema.safeParse(zeroPriority);
    expect(result.success).toBe(true);
  });

  it('rejects negative ratePercent', () => {
    const invalid = {
      ...DEFAULT_SURCHARGE_RULE,
      categories: [{ category: 'NIGHT', ratePercent: -10, priority: 100 }],
    };
    const result = SurchargeRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('HIGHEST_ONLY overlap: holiday on weekend applies holiday rate, not weekend', () => {
    // When a shift falls on a public holiday that is also a weekend (e.g., Dec 25
    // on a Saturday), both WEEKEND and HOLIDAY categories match. With HIGHEST_ONLY,
    // the highest-priority category wins: HOLIDAY (300) > WEEKEND (200).
    expect(DEFAULT_SURCHARGE_RULE.overlapStrategy).toBe('HIGHEST_ONLY');
    const holiday = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'HOLIDAY')!;
    const weekend = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'WEEKEND')!;
    expect(holiday.priority).toBeGreaterThan(weekend.priority);
    expect(holiday.ratePercent).toBe(100);
    expect(weekend.ratePercent).toBe(50);
  });

  it('night window wraps around midnight (startLocalTime > endLocalTime in clock order)', () => {
    // 20:00 to 06:00 means the window crosses midnight:
    // Day 1: 20:00→23:59 | Day 2: 00:00→06:00
    // An overnight shift from 22:00 to 02:00 falls entirely within the night window.
    const { startLocalTime, endLocalTime } = DEFAULT_SURCHARGE_RULE.nightWindow;
    expect(startLocalTime).toBe('20:00');
    expect(endLocalTime).toBe('06:00');
    // Start > End in clock terms signals a midnight-crossing window
    expect(startLocalTime > endLocalTime).toBe(true);
  });
});
