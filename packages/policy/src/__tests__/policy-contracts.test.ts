import { describe, expect, it } from 'vitest';
import { PolicyEvalResultSchema, PolicyViolationSchema } from '../index.js';

describe('policy contracts', () => {
  it('accepts an actionable labor-policy violation and rejects an unknown severity', () => {
    expect(
      PolicyViolationSchema.safeParse({
        ruleId: 'break-arbzg-default',
        ruleName: 'Break requirements',
        severity: 'ERROR',
        message: 'Missing 30-minute break',
        context: { workedHours: 7, breakMinutes: 0 },
      }).success,
    ).toBe(true);
    expect(
      PolicyViolationSchema.safeParse({
        ruleId: 'x',
        ruleName: 'x',
        severity: 'CRITICAL',
        message: 'x',
      }).success,
    ).toBe(false);
  });

  it('requires a timestamped policy evaluation result', () => {
    expect(
      PolicyEvalResultSchema.safeParse({
        passed: false,
        ruleVersion: 1,
        evaluatedAt: '2026-01-15T10:00:00.000Z',
        violations: [
          {
            ruleId: 'rest',
            ruleName: 'Rest',
            severity: 'ERROR',
            message: 'Minimum rest was not met',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      PolicyEvalResultSchema.safeParse({ passed: true, ruleVersion: 1, violations: [] }).success,
    ).toBe(false);
  });
});
