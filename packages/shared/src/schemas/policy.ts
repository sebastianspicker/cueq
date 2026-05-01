import { z } from 'zod';

export const PolicyRuleTypeSchema = z.enum([
  'BREAK_RULE',
  'REST_RULE',
  'MAX_HOURS_RULE',
  'LEAVE_RULE',
  'SURCHARGE_RULE',
]);
export type PolicyRuleType = z.infer<typeof PolicyRuleTypeSchema>;

export const PolicyCatalogEntrySchema = z.object({
  id: z.string(),
  type: PolicyRuleTypeSchema,
  name: z.string(),
  description: z.string(),
  version: z.number().int().positive(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  payload: z.record(z.unknown()),
});
export type PolicyCatalogEntry = z.infer<typeof PolicyCatalogEntrySchema>;

export const PolicyBundleQuerySchema = z.object({
  asOf: z.string().date().optional(),
});
export type PolicyBundleQuery = z.infer<typeof PolicyBundleQuerySchema>;

export const PolicyBundleSchema = z.object({
  asOf: z.string().date(),
  policies: z.array(PolicyCatalogEntrySchema),
});
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;

export const PolicyHistoryQuerySchema = z.object({
  type: PolicyRuleTypeSchema.optional(),
});
export type PolicyHistoryQuery = z.infer<typeof PolicyHistoryQuerySchema>;

export const PolicyHistorySchema = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(PolicyCatalogEntrySchema),
});
export type PolicyHistory = z.infer<typeof PolicyHistorySchema>;

export const TimeThresholdsUpsertSchema = z.object({
  dailyMaxMinutes: z.number().int().positive().max(720),
  minRestMinutes: z.number().int().positive().max(1440),
});
export type TimeThresholdsUpsert = z.infer<typeof TimeThresholdsUpsertSchema>;

export const TimeThresholdsResultSchema = z.object({
  dailyMaxMinutes: z.number().int(),
  minRestMinutes: z.number().int(),
});
export type TimeThresholdsResult = z.infer<typeof TimeThresholdsResultSchema>;
