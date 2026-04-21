import { z } from 'zod';

/**
 * Base type for all policy rules — versioned with effective dates.
 */
export const PolicyRuleMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.number().int().positive(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type PolicyRuleMeta = z.infer<typeof PolicyRuleMetaSchema>;

/**
 * Result of evaluating a rule against data.
 */
export const PolicyViolationSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
});
export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

/**
 * A generic policy evaluation result.
 */
export const PolicyEvalResultSchema = z.object({
  passed: z.boolean(),
  violations: z.array(PolicyViolationSchema),
  evaluatedAt: z.string().datetime(),
  ruleVersion: z.number().int(),
});
export type PolicyEvalResult = z.infer<typeof PolicyEvalResultSchema>;
