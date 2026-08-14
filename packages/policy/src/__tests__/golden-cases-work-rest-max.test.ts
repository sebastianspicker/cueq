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
  BreakRuleSchema,
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  MaxHoursRuleSchema,
  RestRuleSchema,
  type BreakRule,
  type MaxHoursRule,
} from '../index.js';

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
    // workedHoursMin, not clock time: so crossing midnight has no effect.
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
