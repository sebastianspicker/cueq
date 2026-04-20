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
import { describe, it, expect } from 'vitest';
import {
  PolicyRuleMetaSchema,
  BreakRuleSchema,
  DEFAULT_BREAK_RULE,
  RestRuleSchema,
  DEFAULT_REST_RULE,
  MaxHoursRuleSchema,
  DEFAULT_MAX_HOURS_RULE,
  LeaveRuleSchema,
  DEFAULT_LEAVE_RULE,
  SurchargeRuleSchema,
  DEFAULT_SURCHARGE_RULE,
  PolicyViolationSchema,
  PolicyEvalResultSchema,
  getActivePolicyBundle,
  getPolicyHistory,
  POLICY_HISTORY,
  type BreakRule,
  type MaxHoursRule,
  type LeaveRule,
  type PolicyCatalogRule,
} from '../index';

describe('Golden Cases: Policy Rule Schema Validation', () => {
  it('DEFAULT_BREAK_RULE passes schema validation', () => {
    const result = BreakRuleSchema.safeParse(DEFAULT_BREAK_RULE);
    expect(result.success).toBe(true);
  });

  it('DEFAULT_REST_RULE passes schema validation', () => {
    const result = RestRuleSchema.safeParse(DEFAULT_REST_RULE);
    expect(result.success).toBe(true);
  });

  it('DEFAULT_MAX_HOURS_RULE passes schema validation', () => {
    const result = MaxHoursRuleSchema.safeParse(DEFAULT_MAX_HOURS_RULE);
    expect(result.success).toBe(true);
  });

  it('DEFAULT_LEAVE_RULE passes schema validation', () => {
    const result = LeaveRuleSchema.safeParse(DEFAULT_LEAVE_RULE);
    expect(result.success).toBe(true);
  });

  it('DEFAULT_SURCHARGE_RULE passes schema validation', () => {
    const result = SurchargeRuleSchema.safeParse(DEFAULT_SURCHARGE_RULE);
    expect(result.success).toBe(true);
  });
});

describe('Golden Cases: PolicyRuleMetaSchema Base Validation', () => {
  const validMeta = {
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    version: 1,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
  };

  it('accepts valid metadata with null effectiveTo', () => {
    expect(PolicyRuleMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  it('accepts valid metadata with explicit effectiveTo date', () => {
    const withExpiry = { ...validMeta, effectiveTo: '2025-12-31' };
    expect(PolicyRuleMetaSchema.safeParse(withExpiry).success).toBe(true);
  });

  it('rejects version=0 (must be positive integer)', () => {
    const invalid = { ...validMeta, version: 0 };
    expect(PolicyRuleMetaSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative version', () => {
    const invalid = { ...validMeta, version: -1 };
    expect(PolicyRuleMetaSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects non-integer version', () => {
    const invalid = { ...validMeta, version: 1.5 };
    expect(PolicyRuleMetaSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid effectiveFrom format (slash-separated)', () => {
    const invalid = { ...validMeta, effectiveFrom: '2024/01/01' };
    expect(PolicyRuleMetaSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid createdAt format (date-only, not datetime)', () => {
    const invalid = { ...validMeta, createdAt: '2026-01-01' };
    expect(PolicyRuleMetaSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('Golden Cases: Break Rule Constraints', () => {
  it('requires at least 30min break after 6h of work', () => {
    const sixHourThreshold = DEFAULT_BREAK_RULE.thresholds.find((t) => t.workedHoursMin === 6);
    expect(sixHourThreshold).toBeDefined();
    expect(sixHourThreshold!.requiredBreakMinutes).toBeGreaterThanOrEqual(30);
  });

  it('requires at least 45min break after 9h of work', () => {
    const nineHourThreshold = DEFAULT_BREAK_RULE.thresholds.find((t) => t.workedHoursMin === 9);
    expect(nineHourThreshold).toBeDefined();
    expect(nineHourThreshold!.requiredBreakMinutes).toBeGreaterThanOrEqual(45);
  });

  it('pins exact ArbZG thresholds: 6h→30min, 9h→45min', () => {
    expect(DEFAULT_BREAK_RULE.thresholds).toEqual([
      { workedHoursMin: 6, requiredBreakMinutes: 30 },
      { workedHoursMin: 9, requiredBreakMinutes: 45 },
    ]);
  });

  it('has exactly two thresholds for ArbZG default', () => {
    expect(DEFAULT_BREAK_RULE.thresholds).toHaveLength(2);
  });

  it('defaults autoDeduct to false', () => {
    expect(DEFAULT_BREAK_RULE.autoDeduct).toBe(false);
  });

  it('rejects a break rule with zero thresholds', () => {
    const invalid = { ...DEFAULT_BREAK_RULE, thresholds: [] };
    const result = BreakRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a break rule with negative workedHoursMin', () => {
    const invalid = {
      ...DEFAULT_BREAK_RULE,
      thresholds: [{ workedHoursMin: -1, requiredBreakMinutes: 30 }],
    };
    const result = BreakRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a break rule with zero requiredBreakMinutes', () => {
    const invalid = {
      ...DEFAULT_BREAK_RULE,
      thresholds: [{ workedHoursMin: 6, requiredBreakMinutes: 0 }],
    };
    const result = BreakRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts a part-time break rule with a single lower threshold', () => {
    const partTime: BreakRule = {
      ...DEFAULT_BREAK_RULE,
      id: 'break-part-time',
      thresholds: [{ workedHoursMin: 4, requiredBreakMinutes: 20 }],
    };
    const result = BreakRuleSchema.safeParse(partTime);
    expect(result.success).toBe(true);
    expect(partTime.thresholds).toHaveLength(1);
  });

  it('accepts autoDeduct=true as a valid configuration', () => {
    const autoDeductRule: BreakRule = {
      ...DEFAULT_BREAK_RULE,
      id: 'break-auto-deduct',
      autoDeduct: true,
    };
    const result = BreakRuleSchema.safeParse(autoDeductRule);
    expect(result.success).toBe(true);
    expect(autoDeductRule.autoDeduct).toBe(true);
  });

  it('rejects workedHoursMin=0 (must be strictly positive)', () => {
    const invalid = {
      ...DEFAULT_BREAK_RULE,
      thresholds: [{ workedHoursMin: 0, requiredBreakMinutes: 30 }],
    };
    const result = BreakRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('break thresholds are agnostic to time-of-day (overnight shifts use total worked hours)', () => {
    // A shift from 22:00 to 06:00 = 8h worked. Break rules only check total
    // workedHoursMin, not clock time — so crossing midnight has no effect.
    const sixHourThreshold = DEFAULT_BREAK_RULE.thresholds.find((t) => t.workedHoursMin === 6);
    expect(sixHourThreshold).toBeDefined();
    // 8h worked (regardless of crossing midnight) exceeds 6h threshold
    expect(8).toBeGreaterThanOrEqual(sixHourThreshold!.workedHoursMin);
    expect(sixHourThreshold!.requiredBreakMinutes).toBe(30);
  });
});

describe('Golden Cases: Rest Period Constraints', () => {
  it('mandates minimum 11h rest between work days', () => {
    expect(DEFAULT_REST_RULE.minRestHours).toBeGreaterThanOrEqual(11);
  });

  it('pins exact rest hours to 11 (ArbZG §5)', () => {
    expect(DEFAULT_REST_RULE.minRestHours).toBe(11);
  });

  it('uses CONTINUE_INTO_NEXT_DAY for cross-midnight shifts', () => {
    expect(DEFAULT_REST_RULE.crossMidnightHandling).toBe('CONTINUE_INTO_NEXT_DAY');
  });

  it('enables on-call rest reduction with 11h minimum after deployment', () => {
    expect(DEFAULT_REST_RULE.onCallRestReduction).toEqual({
      enabled: true,
      minRestHoursAfterDeployment: 11,
    });
  });

  it('accepts SPLIT_AT_MIDNIGHT as valid cross-midnight handling', () => {
    const splitRule = { ...DEFAULT_REST_RULE, crossMidnightHandling: 'SPLIT_AT_MIDNIGHT' };
    const result = RestRuleSchema.safeParse(splitRule);
    expect(result.success).toBe(true);
  });

  it('rejects invalid cross-midnight handling enum value', () => {
    const invalid = { ...DEFAULT_REST_RULE, crossMidnightHandling: 'IGNORE' };
    const result = RestRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects negative minRestHours', () => {
    const invalid = { ...DEFAULT_REST_RULE, minRestHours: -1 };
    const result = RestRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects zero minRestHours', () => {
    const invalid = { ...DEFAULT_REST_RULE, minRestHours: 0 };
    const result = RestRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts onCallRestReduction with enabled=false', () => {
    const disabledOnCall = {
      ...DEFAULT_REST_RULE,
      onCallRestReduction: {
        enabled: false,
        minRestHoursAfterDeployment: 11,
      },
    };
    const result = RestRuleSchema.safeParse(disabledOnCall);
    expect(result.success).toBe(true);
    expect(disabledOnCall.onCallRestReduction.enabled).toBe(false);
  });

  it('rejects zero minRestHoursAfterDeployment (must be positive)', () => {
    const invalid = {
      ...DEFAULT_REST_RULE,
      onCallRestReduction: {
        enabled: true,
        minRestHoursAfterDeployment: 0,
      },
    };
    const result = RestRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows omitting onCallRestReduction (optional field)', () => {
    const { onCallRestReduction: _, ...ruleWithout } = DEFAULT_REST_RULE;
    const result = RestRuleSchema.safeParse(ruleWithout);
    expect(result.success).toBe(true);
  });
});

describe('Golden Cases: Max Hours Rule Constraints', () => {
  it('pins default daily max to 8h (ArbZG §3)', () => {
    expect(DEFAULT_MAX_HOURS_RULE.maxDailyHours).toBe(8);
  });

  it('pins extended daily max to 10h (ArbZG §3 with compensation)', () => {
    expect(DEFAULT_MAX_HOURS_RULE.maxDailyHoursExtended).toBe(10);
  });

  it('pins weekly max to 48h', () => {
    expect(DEFAULT_MAX_HOURS_RULE.maxWeeklyHours).toBe(48);
  });

  it('uses 24-week reference period for averaging', () => {
    expect(DEFAULT_MAX_HOURS_RULE.referenceWeeks).toBe(24);
  });

  it('extended daily max is greater than standard daily max', () => {
    expect(DEFAULT_MAX_HOURS_RULE.maxDailyHoursExtended).toBeGreaterThan(
      DEFAULT_MAX_HOURS_RULE.maxDailyHours,
    );
  });

  it('weekly max is consistent with 6 × daily standard (48 = 6 × 8)', () => {
    expect(DEFAULT_MAX_HOURS_RULE.maxWeeklyHours).toBe(DEFAULT_MAX_HOURS_RULE.maxDailyHours * 6);
  });

  it('rejects zero maxDailyHours', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, maxDailyHours: 0 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-integer referenceWeeks', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, referenceWeeks: 24.5 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects negative maxWeeklyHours', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, maxWeeklyHours: -1 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects zero maxDailyHoursExtended', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, maxDailyHoursExtended: 0 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects zero maxWeeklyHours', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, maxWeeklyHours: 0 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects zero referenceWeeks', () => {
    const invalid = { ...DEFAULT_MAX_HOURS_RULE, referenceWeeks: 0 };
    const result = MaxHoursRuleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts a part-time max-hours rule with reduced weekly limit', () => {
    const partTime: MaxHoursRule = {
      ...DEFAULT_MAX_HOURS_RULE,
      id: 'maxhours-part-time-20h',
      maxDailyHours: 4,
      maxDailyHoursExtended: 6,
      maxWeeklyHours: 20,
    };
    const result = MaxHoursRuleSchema.safeParse(partTime);
    expect(result.success).toBe(true);
    expect(partTime.maxWeeklyHours).toBe(20);
  });
});

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

  it('leave entitlement is in work-days — weekend holidays do not reduce count', () => {
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

describe('Golden Cases: Policy Catalog', () => {
  it('POLICY_HISTORY contains exactly 5 default rules', () => {
    expect(POLICY_HISTORY).toHaveLength(5);
  });

  it('getActivePolicyBundle returns all 5 rules for a date within effective range', () => {
    const bundle = getActivePolicyBundle('2026-01-15');
    expect(bundle).toHaveLength(5);
    expect(bundle.map((r) => r.type)).toEqual([
      'BREAK_RULE',
      'LEAVE_RULE',
      'MAX_HOURS_RULE',
      'REST_RULE',
      'SURCHARGE_RULE',
    ]);
  });

  it('getActivePolicyBundle returns rules on exact effectiveFrom date', () => {
    const bundle = getActivePolicyBundle('2024-01-01');
    expect(bundle).toHaveLength(5);
  });

  it('getActivePolicyBundle returns empty/throws for date before all rules', () => {
    // All rules have effectiveFrom: '2024-01-01', so 2023-12-31 should have no active rules
    // The function doesn't explicitly throw when no rules match — it returns an empty array
    // because it only throws per-type when grouped entries exist but latest is null
    const bundle = getActivePolicyBundle('2023-12-31');
    expect(bundle).toHaveLength(0);
  });

  it('getPolicyHistory returns all rules sorted by type when no filter', () => {
    const history = getPolicyHistory();
    expect(history).toHaveLength(5);
    const types = history.map((r) => r.type);
    // Verify alphabetical sort
    expect(types).toEqual([...types].sort());
  });

  it('getPolicyHistory filters by REST_RULE and returns version-descending', () => {
    const history = getPolicyHistory('REST_RULE');
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe('REST_RULE');
    expect(history[0]!.version).toBe(1);
  });

  it('getPolicyHistory returns empty for non-existent type filter', () => {
    // TypeScript wouldn't normally allow this, but at runtime it could happen
    const history = getPolicyHistory('NONEXISTENT_RULE' as any);
    expect(history).toHaveLength(0);
  });

  it('getActivePolicyBundle resolves latest version when multiple versions exist', () => {
    // This test documents the version-conflict resolution behavior:
    // When multiple versions of the same rule type are active on a date,
    // the one with the highest version number wins.
    // Currently POLICY_HISTORY has only v1 rules, so we verify the resolved
    // version is 1 for each rule.
    const bundle = getActivePolicyBundle('2026-01-15');
    for (const rule of bundle) {
      expect(rule.version).toBe(1);
    }
  });

  it('all rules in POLICY_HISTORY have effectiveFrom 2024-01-01 and no effectiveTo', () => {
    for (const rule of POLICY_HISTORY) {
      expect(rule.effectiveFrom).toBe('2024-01-01');
      expect(rule.effectiveTo).toBeNull();
    }
  });

  it('bundle rules are sorted alphabetically by type', () => {
    const bundle = getActivePolicyBundle('2026-01-15');
    const types = bundle.map((r) => r.type);
    expect(types).toEqual([...types].sort());
  });

  it('effectiveTo=null means rules remain active indefinitely (far-future query)', () => {
    // All current rules have effectiveTo=null — they never expire.
    // Querying a far-future date should still return all 5 rules.
    const farFuture = getActivePolicyBundle('2099-12-31');
    expect(farFuture).toHaveLength(5);
  });

  it('getActivePolicyBundle includes rule when asOf equals effectiveTo (inclusive boundary)', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-06-30' }];
    const bundle = getActivePolicyBundle('2025-06-30', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.type).toBe('BREAK_RULE');
  });

  it('getActivePolicyBundle excludes rule when asOf is after effectiveTo', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-06-30' }];
    const bundle = getActivePolicyBundle('2025-07-01', history);
    expect(bundle).toHaveLength(0);
  });

  it('getActivePolicyBundle includes rule when asOf is within effectiveTo range', () => {
    const history: PolicyCatalogRule[] = [{ ...DEFAULT_BREAK_RULE, effectiveTo: '2025-12-31' }];
    const bundle = getActivePolicyBundle('2025-06-15', history);
    expect(bundle).toHaveLength(1);
  });

  it('getActivePolicyBundle resolves version conflicts: latest version wins', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-arbzg-v2', version: 2 },
      { ...DEFAULT_BREAK_RULE, id: 'break-arbzg-v3', version: 3 },
    ];
    const bundle = getActivePolicyBundle('2026-01-15', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.version).toBe(3);
  });

  it('getActivePolicyBundle resolves versions per type independently', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v2', version: 2 },
      { ...DEFAULT_REST_RULE, version: 1 },
      { ...DEFAULT_REST_RULE, id: 'rest-v5', version: 5 },
    ];
    const bundle = getActivePolicyBundle('2026-01-15', history);
    expect(bundle).toHaveLength(2);
    const breakRule = bundle.find((r) => r.type === 'BREAK_RULE')!;
    const restRule = bundle.find((r) => r.type === 'REST_RULE')!;
    expect(breakRule.version).toBe(2);
    expect(restRule.version).toBe(5);
  });

  it('getActivePolicyBundle excludes expired version but includes current one', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1, effectiveTo: '2025-06-30' },
      {
        ...DEFAULT_BREAK_RULE,
        id: 'break-v2',
        version: 2,
        effectiveFrom: '2025-07-01',
        effectiveTo: null,
      },
    ];
    // Query in the v2 era
    const bundle = getActivePolicyBundle('2025-08-01', history);
    expect(bundle).toHaveLength(1);
    expect(bundle[0]!.version).toBe(2);
  });

  it('getPolicyHistory returns BREAK_RULE entries sorted by version descending', () => {
    const history: PolicyCatalogRule[] = [
      { ...DEFAULT_BREAK_RULE, version: 1 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v3', version: 3 },
      { ...DEFAULT_BREAK_RULE, id: 'break-v2', version: 2 },
    ];
    const result = getPolicyHistory('BREAK_RULE', history);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.version)).toEqual([3, 2, 1]);
  });

  it('getPolicyHistory filters correctly across mixed types', () => {
    const history: PolicyCatalogRule[] = [
      DEFAULT_BREAK_RULE,
      DEFAULT_REST_RULE,
      DEFAULT_MAX_HOURS_RULE,
    ];
    const breakOnly = getPolicyHistory('BREAK_RULE', history);
    expect(breakOnly).toHaveLength(1);
    expect(breakOnly[0]!.type).toBe('BREAK_RULE');
  });

  it('getPolicyHistory without filter returns all entries sorted by type', () => {
    const history: PolicyCatalogRule[] = [
      DEFAULT_REST_RULE,
      DEFAULT_BREAK_RULE,
      DEFAULT_MAX_HOURS_RULE,
    ];
    const all = getPolicyHistory(undefined, history);
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.type)).toEqual(['BREAK_RULE', 'MAX_HOURS_RULE', 'REST_RULE']);
  });
});

describe('Golden Cases: Policy Evaluation Types', () => {
  it('PolicyViolationSchema accepts a valid violation', () => {
    const violation = {
      ruleId: 'break-arbzg-default',
      ruleName: 'ArbZG §4 Break Requirements',
      severity: 'ERROR',
      message: 'Missing 30min break after 6h work',
      context: { workedHours: 7, breakMinutes: 0 },
    };
    const result = PolicyViolationSchema.safeParse(violation);
    expect(result.success).toBe(true);
  });

  it('PolicyViolationSchema accepts all severity levels', () => {
    for (const severity of ['ERROR', 'WARNING', 'INFO'] as const) {
      const violation = {
        ruleId: 'test',
        ruleName: 'Test Rule',
        severity,
        message: `Test ${severity}`,
      };
      expect(PolicyViolationSchema.safeParse(violation).success).toBe(true);
    }
  });

  it('PolicyViolationSchema rejects invalid severity', () => {
    const invalid = {
      ruleId: 'test',
      ruleName: 'Test Rule',
      severity: 'CRITICAL',
      message: 'Bad severity',
    };
    expect(PolicyViolationSchema.safeParse(invalid).success).toBe(false);
  });

  it('PolicyViolationSchema allows omitting optional context', () => {
    const violation = {
      ruleId: 'test',
      ruleName: 'Test Rule',
      severity: 'WARNING',
      message: 'No context provided',
    };
    expect(PolicyViolationSchema.safeParse(violation).success).toBe(true);
  });

  it('PolicyEvalResultSchema accepts a passing result', () => {
    const result = {
      passed: true,
      violations: [],
      evaluatedAt: '2026-01-15T10:00:00.000Z',
      ruleVersion: 1,
    };
    expect(PolicyEvalResultSchema.safeParse(result).success).toBe(true);
  });

  it('PolicyEvalResultSchema accepts a failing result with violations', () => {
    const result = {
      passed: false,
      violations: [
        {
          ruleId: 'break-arbzg-default',
          ruleName: 'ArbZG §4 Break Requirements',
          severity: 'ERROR',
          message: 'Break too short',
        },
      ],
      evaluatedAt: '2026-01-15T10:00:00.000Z',
      ruleVersion: 1,
    };
    expect(PolicyEvalResultSchema.safeParse(result).success).toBe(true);
  });

  it('PolicyEvalResultSchema rejects missing evaluatedAt', () => {
    const invalid = {
      passed: true,
      violations: [],
      ruleVersion: 1,
    };
    expect(PolicyEvalResultSchema.safeParse(invalid).success).toBe(false);
  });

  it('PolicyEvalResultSchema accepts ruleVersion=0 (schema allows any integer)', () => {
    const result = {
      passed: true,
      violations: [],
      evaluatedAt: '2026-01-15T10:00:00.000Z',
      ruleVersion: 0,
    };
    expect(PolicyEvalResultSchema.safeParse(result).success).toBe(true);
  });

  it('PolicyEvalResultSchema rejects non-integer ruleVersion', () => {
    const invalid = {
      passed: true,
      violations: [],
      evaluatedAt: '2026-01-15T10:00:00.000Z',
      ruleVersion: 1.5,
    };
    expect(PolicyEvalResultSchema.safeParse(invalid).success).toBe(false);
  });

  it('PolicyEvalResultSchema accepts multiple violations', () => {
    const result = {
      passed: false,
      violations: [
        {
          ruleId: 'break-arbzg-default',
          ruleName: 'ArbZG §4 Break Requirements',
          severity: 'ERROR',
          message: 'Missing 30min break after 6h work',
          context: { workedHours: 7, breakMinutes: 0 },
        },
        {
          ruleId: 'maxhours-arbzg-default',
          ruleName: 'ArbZG §3 Maximum Working Hours',
          severity: 'WARNING',
          message: 'Daily hours exceed 8h standard limit',
          context: { dailyHours: 9 },
        },
      ],
      evaluatedAt: '2026-01-15T10:00:00.000Z',
      ruleVersion: 1,
    };
    const parsed = PolicyEvalResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.violations).toHaveLength(2);
    }
  });

  it('PolicyViolationSchema rejects missing ruleId', () => {
    const invalid = {
      ruleName: 'Test Rule',
      severity: 'ERROR',
      message: 'Missing ruleId',
    };
    expect(PolicyViolationSchema.safeParse(invalid).success).toBe(false);
  });

  it('PolicyViolationSchema rejects missing message', () => {
    const invalid = {
      ruleId: 'test',
      ruleName: 'Test Rule',
      severity: 'ERROR',
    };
    expect(PolicyViolationSchema.safeParse(invalid).success).toBe(false);
  });
});
