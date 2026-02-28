import { z } from 'zod';
import { PolicyRuleMetaSchema } from '../types';

/**
 * Leave/absence rules (TV-L §26).
 * - Default 30 days for 5-day week (TV-L)
 * - Pro-rata for part-time and mid-year entry/exit
 * - Carry-over with forfeiture deadline
 */
export const LeaveRuleSchema = PolicyRuleMetaSchema.extend({
  type: z.literal('LEAVE_RULE'),
  annualEntitlementDays: z.number().positive(),
  fullTimeWeeklyHours: z.number().positive(),
  workDaysPerWeek: z.number().int().positive(),
  proRataOnEntry: z.boolean(),
  proRataOnExit: z.boolean(),
  carryOver: z.object({
    enabled: z.boolean(),
    maxDays: z.number().nonnegative(),
    forfeitureDeadline: z.string(), // e.g. "03-31" = March 31st
  }),
});
export type LeaveRule = z.infer<typeof LeaveRuleSchema>;

export const DEFAULT_LEAVE_RULE: LeaveRule = {
  id: 'leave-tvl-default',
  name: 'TV-L §26 Annual Leave',
  description: '30 days annual leave for 5-day week, carry-over until March 31',
  version: 1,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
  type: 'LEAVE_RULE',
  annualEntitlementDays: 30,
  fullTimeWeeklyHours: 39.83,
  workDaysPerWeek: 5,
  proRataOnEntry: true,
  proRataOnExit: true,
  carryOver: {
    enabled: true,
    maxDays: 30,
    forfeitureDeadline: '03-31',
  },
};
