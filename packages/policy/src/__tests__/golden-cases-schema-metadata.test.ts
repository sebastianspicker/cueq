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
  DEFAULT_LEAVE_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_SURCHARGE_RULE,
  LeaveRuleSchema,
  MaxHoursRuleSchema,
  PolicyRuleMetaSchema,
  RestRuleSchema,
  SurchargeRuleSchema,
} from '../index.js';

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
  const validMeta = Object.freeze({
    id: 'test-rule',
    name: 'Test Rule',
    description: 'A test rule',
    version: 1,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
  });

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
