import { z } from 'zod';
import { PolicyRuleMetaSchema } from '../types';

/**
 * Rest period rules (ArbZG §5).
 * - Minimum 11h uninterrupted rest between work days
 * - Special rules for on-call deployments
 * - Cross-midnight shift handling
 */
export const RestRuleSchema = PolicyRuleMetaSchema.extend({
  type: z.literal('REST_RULE'),
  minRestHours: z.number().positive(),
  crossMidnightHandling: z.enum(['SPLIT_AT_MIDNIGHT', 'CONTINUE_INTO_NEXT_DAY']),
  onCallRestReduction: z
    .object({
      enabled: z.boolean(),
      minRestHoursAfterDeployment: z.number().positive(),
    })
    .optional(),
});
export type RestRule = z.infer<typeof RestRuleSchema>;

// Default German labor law rest rule (ArbZG §5)
export const DEFAULT_REST_RULE: RestRule = {
  id: 'rest-arbzg-default',
  name: 'ArbZG §5 Rest Period',
  description: 'Minimum 11 hours uninterrupted rest between work days',
  version: 1,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
  type: 'REST_RULE',
  minRestHours: 11,
  crossMidnightHandling: 'CONTINUE_INTO_NEXT_DAY',
  onCallRestReduction: {
    enabled: true,
    minRestHoursAfterDeployment: 11,
  },
};
