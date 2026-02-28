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
});

describe('Golden Cases: Rest Period Constraints', () => {
  it('mandates minimum 11h rest between work days', () => {
    expect(DEFAULT_REST_RULE.minRestHours).toBeGreaterThanOrEqual(11);
  });
});

describe('Golden Cases: Leave Entitlement Constraints', () => {
  it('provides 30 days annual leave for TV-L full-time', () => {
    expect(DEFAULT_LEAVE_RULE.annualEntitlementDays).toBe(30);
    expect(DEFAULT_LEAVE_RULE.workDaysPerWeek).toBe(5);
  });

  it('enables carry-over with forfeiture deadline', () => {
    expect(DEFAULT_LEAVE_RULE.carryOver.enabled).toBe(true);
    expect(DEFAULT_LEAVE_RULE.carryOver.forfeitureDeadline).toBe('03-31');
  });
});
