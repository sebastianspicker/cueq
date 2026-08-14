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
import { PolicyEvalResultSchema, PolicyViolationSchema } from '../index.js';

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
