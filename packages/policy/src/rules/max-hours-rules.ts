import { z } from 'zod';
import { PolicyRuleMetaSchema } from '../types';

/**
 * Maximum working hours rules (ArbZG §3).
 * - Max 8h/day (extendable to 10h with compensation)
 * - Max 48h/week (averaged over reference period)
 */
export const MaxHoursRuleSchema = PolicyRuleMetaSchema.extend({
  type: z.literal('MAX_HOURS_RULE'),
  maxDailyHours: z.number().positive(),
  maxDailyHoursExtended: z.number().positive(),
  maxWeeklyHours: z.number().positive(),
  referenceWeeks: z.number().int().positive(),
});
export type MaxHoursRule = z.infer<typeof MaxHoursRuleSchema>;

export const DEFAULT_MAX_HOURS_RULE: MaxHoursRule = {
  id: 'maxhours-arbzg-default',
  name: 'ArbZG §3 Maximum Working Hours',
  description: 'Max 8h/day (10h extended), 48h/week averaged over 24 weeks',
  version: 1,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  createdAt: new Date().toISOString(),
  createdBy: 'system',
  type: 'MAX_HOURS_RULE',
  maxDailyHours: 8,
  maxDailyHoursExtended: 10,
  maxWeeklyHours: 48,
  referenceWeeks: 24,
};
