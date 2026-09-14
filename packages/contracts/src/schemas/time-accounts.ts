/** Appointment account preparation and explicit, revision-checked reconciliation. */
import { z } from 'zod';
import { CursorPageSchema, CursorQuerySchema, DateTimeSchema, IdSchema } from './common.js';

export const TimeAccountSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  assignmentId: IdSchema,
  periodStart: DateTimeSchema,
  periodEnd: DateTimeSchema,
  targetHours: z.number(),
  actualHours: z.number(),
  balance: z.number(),
  overtimeHours: z.number().nonnegative(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export const TimeAccountPageSchema = CursorPageSchema(TimeAccountSchema);
export const TimeAccountQuerySchema = CursorQuerySchema.extend({
  assignmentId: IdSchema,
  personId: IdSchema.optional(),
});
const AccountHoursSchema = z.number().min(-99_999_999.99).max(99_999_999.99).multipleOf(0.01);
const TimeAccountSegmentSchema = z
  .object({
    periodStart: DateTimeSchema,
    periodEnd: DateTimeSchema,
    targetHours: AccountHoursSchema.nonnegative(),
    actualHours: AccountHoursSchema.nonnegative(),
    balance: AccountHoursSchema,
    overtimeHours: AccountHoursSchema.nonnegative(),
  })
  .strict()
  .refine((v) => Date.parse(v.periodStart) < Date.parse(v.periodEnd), {
    message: 'Account end must follow start',
  })
  .refine((v) => Math.abs(v.balance - (v.actualHours - v.targetHours)) < 0.005, {
    message: 'Balance must equal actual minus target hours',
  });
export const SplitTimeAccountSchema = z
  .object({
    expectedUpdatedAt: DateTimeSchema,
    reason: z.string().trim().min(10).max(1000),
    segments: z.array(TimeAccountSegmentSchema).min(2).max(100),
  })
  .strict();
export const SplitTimeAccountResultSchema = z.array(TimeAccountSchema).min(2).max(100);
export const PrepareTimeAccountsResultSchema = z.object({
  closingPeriodId: IdSchema,
  created: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
});
export type TimeAccount = z.infer<typeof TimeAccountSchema>;
