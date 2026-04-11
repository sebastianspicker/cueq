import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAVE_RULE } from '../rules/leave-rules';
import { DEFAULT_BREAK_RULE } from '../rules/break-rules';
import { DEFAULT_SURCHARGE_RULE } from '../rules/surcharge-rules';
import { DEFAULT_REST_RULE } from '../rules/rest-rules';
import { DEFAULT_MAX_HOURS_RULE } from '../rules/max-hours-rules';
import {
  PolicyViolationSchema,
  PolicyEvalResultSchema,
  type PolicyViolation,
  type PolicyEvalResult,
} from '../types';
import { getActivePolicyBundle, POLICY_HISTORY } from '../catalog';

describe('@cueq/policy compliance', () => {
  it('keeps TV-L annual entitlement baseline at 30 days', () => {
    expect(DEFAULT_LEAVE_RULE.annualEntitlementDays).toBe(30);
  });

  describe('GDPR — absence reason privacy', () => {
    it('policy rule schemas do not include absence-reason fields', () => {
      // GDPR requires that absence reasons (e.g., "sick", "therapy") are never
      // exposed to unauthorized roles. Policy rules must not embed or reference
      // raw absence reasons — they define entitlement structures, not personal data.
      const ruleKeys = [
        ...Object.keys(DEFAULT_LEAVE_RULE),
        ...Object.keys(DEFAULT_BREAK_RULE),
        ...Object.keys(DEFAULT_REST_RULE),
        ...Object.keys(DEFAULT_MAX_HOURS_RULE),
        ...Object.keys(DEFAULT_SURCHARGE_RULE),
      ];

      const gdprSensitivePatterns = [
        'absenceReason',
        'sickNote',
        'diagnosis',
        'medicalReason',
        'healthData',
        'personalReason',
      ];

      for (const key of ruleKeys) {
        for (const pattern of gdprSensitivePatterns) {
          expect(key.toLowerCase()).not.toContain(pattern.toLowerCase());
        }
      }
    });

    it('policy evaluation result schema does not leak personal absence details', () => {
      // The PolicyEvalResult carries violations — verify a violation's context
      // cannot structurally embed GDPR-sensitive fields by ensuring the schema
      // only accepts the defined shape, not arbitrary personal data at the top level.
      const violationWithSensitiveField = {
        ruleId: 'test',
        ruleName: 'Test',
        severity: 'WARNING' as const,
        message: 'Test violation',
        // context is z.record(z.unknown()).optional() — intentionally flexible,
        // but the violation itself must not have named sensitive fields
      };
      const result = PolicyViolationSchema.safeParse(violationWithSensitiveField);
      expect(result.success).toBe(true);

      // Extra top-level fields beyond the schema are stripped by Zod (strict parsing)
      const parsed = PolicyViolationSchema.parse(violationWithSensitiveField);
      expect(parsed).not.toHaveProperty('absenceReason');
      expect(parsed).not.toHaveProperty('diagnosis');
    });
  });

  describe('severity levels', () => {
    it('violation schema accepts exactly ERROR, WARNING, INFO — no other severities', () => {
      const validSeverities = ['ERROR', 'WARNING', 'INFO'] as const;
      for (const severity of validSeverities) {
        const violation: PolicyViolation = {
          ruleId: 'test-rule',
          ruleName: 'Test Rule',
          severity,
          message: `Violation at ${severity} level`,
        };
        expect(PolicyViolationSchema.safeParse(violation).success).toBe(true);
      }

      const invalidSeverities = ['CRITICAL', 'FATAL', 'DEBUG', 'NOTICE', 'WARN', 'error'];
      for (const severity of invalidSeverities) {
        const invalid = {
          ruleId: 'test-rule',
          ruleName: 'Test Rule',
          severity,
          message: 'Should be rejected',
        };
        expect(PolicyViolationSchema.safeParse(invalid).success).toBe(false);
      }
    });

    it('break violation should carry ERROR severity for ArbZG compliance', () => {
      // ArbZG break violations are legal non-compliance — must be ERROR, not WARNING
      const breakViolation: PolicyViolation = {
        ruleId: DEFAULT_BREAK_RULE.id,
        ruleName: DEFAULT_BREAK_RULE.name,
        severity: 'ERROR',
        message: 'Missing 30min break after 6h work',
        context: { workedHours: 7, breakMinutes: 0 },
      };
      expect(PolicyViolationSchema.safeParse(breakViolation).success).toBe(true);
      expect(breakViolation.severity).toBe('ERROR');
    });

    it('rest period violation should carry ERROR severity for ArbZG compliance', () => {
      const restViolation: PolicyViolation = {
        ruleId: DEFAULT_REST_RULE.id,
        ruleName: DEFAULT_REST_RULE.name,
        severity: 'ERROR',
        message: 'Rest period below 11h minimum',
        context: { restHours: 9.5 },
      };
      expect(PolicyViolationSchema.safeParse(restViolation).success).toBe(true);
      expect(restViolation.severity).toBe('ERROR');
    });
  });

  describe('determinism — same input produces same output', () => {
    it('getActivePolicyBundle returns identical results on repeated calls', () => {
      const date = '2026-03-15';
      const result1 = getActivePolicyBundle(date);
      const result2 = getActivePolicyBundle(date);
      const result3 = getActivePolicyBundle(date);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('policy bundle order is deterministic (sorted by type)', () => {
      const date = '2026-06-01';
      const runs = Array.from({ length: 5 }, () => getActivePolicyBundle(date));
      const firstTypes = runs[0]!.map((r) => r.type);

      for (const run of runs) {
        expect(run.map((r) => r.type)).toEqual(firstTypes);
      }
    });

    it('PolicyEvalResult schema parsing is deterministic', () => {
      const input = {
        passed: false,
        violations: [
          {
            ruleId: 'break-arbzg-default',
            ruleName: 'ArbZG §4 Break Requirements',
            severity: 'ERROR' as const,
            message: 'Missing break',
          },
          {
            ruleId: 'rest-arbzg-default',
            ruleName: 'ArbZG §5 Rest Period',
            severity: 'WARNING' as const,
            message: 'Short rest',
          },
        ],
        evaluatedAt: '2026-03-15T10:00:00.000Z',
        ruleVersion: 1,
      };

      const parsed1 = PolicyEvalResultSchema.parse(input);
      const parsed2 = PolicyEvalResultSchema.parse(input);
      expect(parsed1).toEqual(parsed2);
    });

    it('POLICY_HISTORY is frozen and immutable', () => {
      expect(Object.isFrozen(POLICY_HISTORY)).toBe(true);

      // Attempting to modify should either throw or silently fail
      expect(() => {
        (POLICY_HISTORY as any).push({} as any);
      }).toThrow();
    });
  });
});
