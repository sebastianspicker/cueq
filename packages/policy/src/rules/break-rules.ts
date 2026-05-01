import { z } from 'zod';
import { PolicyRuleMetaSchema } from '../types';

/**
 * Break/pause enforcement rules (ArbZG §4).
 * - >6h worked → 30min break required
 * - >9h worked → 45min break required
 * - Configurable per work-time model
 */
export const BreakRuleSchema = PolicyRuleMetaSchema.extend({
  type: z.literal('BREAK_RULE'),
  thresholds: z
    .array(
      z.object({
        workedHoursMin: z.number().positive(),
        requiredBreakMinutes: z.number().positive(),
      }),
    )
    .min(1),
  autoDeduct: z.boolean().default(false),
});
export type BreakRule = z.infer<typeof BreakRuleSchema>;

// Default German labor law break rule (ArbZG §4)
export const DEFAULT_BREAK_RULE: BreakRule = {
  id: 'break-arbzg-default',
  name: 'ArbZG §4 Break Requirements',
  description: 'Standard German labor law break requirements',
  version: 1,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
  type: 'BREAK_RULE',
  thresholds: [
    { workedHoursMin: 6, requiredBreakMinutes: 30 },
    { workedHoursMin: 9, requiredBreakMinutes: 45 },
  ],
  autoDeduct: false,
};
