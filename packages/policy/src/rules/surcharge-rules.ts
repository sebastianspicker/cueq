/** Defines mutually exclusive surcharge windows and their effective-dated policy contract. */
import { z } from 'zod';
import { PolicyRuleMetaSchema } from '../types.js';

export const SurchargeCategorySchema = z.enum(['NIGHT', 'WEEKEND', 'HOLIDAY']);
export type SurchargeCategory = z.infer<typeof SurchargeCategorySchema>;

const LocalTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine(
    (value) => {
      const [hourRaw, minuteRaw] = value.split(':');
      const hour = Number(hourRaw);
      const minute = Number(minuteRaw);
      return (
        Number.isInteger(hour) &&
        Number.isInteger(minute) &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59
      );
    },
    { message: 'Must be a valid HH:MM local time' },
  );

export const SurchargeRuleSchema = PolicyRuleMetaSchema.extend({
  type: z.literal('SURCHARGE_RULE'),
  overlapStrategy: z.literal('HIGHEST_ONLY'),
  timezoneDefault: z.string().min(1),
  nightWindow: z.object({
    startLocalTime: LocalTimeSchema,
    endLocalTime: LocalTimeSchema,
  }),
  categories: z.array(
    z.object({
      category: SurchargeCategorySchema,
      ratePercent: z.number().nonnegative(),
      priority: z.number().int().nonnegative(),
    }),
  ),
});
export type SurchargeRule = z.infer<typeof SurchargeRuleSchema>;

export const DEFAULT_SURCHARGE_RULE: SurchargeRule = {
  id: 'surcharge-tvl-flat-default',
  name: 'TV-L Flat Surcharge Matrix',
  description: 'Night, weekend, and holiday surcharges with highest-only overlap handling',
  version: 1,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
  type: 'SURCHARGE_RULE',
  overlapStrategy: 'HIGHEST_ONLY',
  timezoneDefault: 'Europe/Berlin',
  nightWindow: {
    startLocalTime: '20:00',
    endLocalTime: '06:00',
  },
  categories: [
    { category: 'NIGHT', ratePercent: 25, priority: 100 },
    { category: 'WEEKEND', ratePercent: 50, priority: 200 },
    { category: 'HOLIDAY', ratePercent: 100, priority: 300 },
  ],
};
