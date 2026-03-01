import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

export const ClosingStatusSchema = z.enum(['OPEN', 'REVIEW', 'APPROVED', 'EXPORTED']);
export type ClosingStatus = z.infer<typeof ClosingStatusSchema>;

export const ClosingLockSourceSchema = z.enum([
  'AUTO_CUTOFF',
  'MANUAL_REVIEW_START',
  'HR_CORRECTION',
]);
export type ClosingLockSource = z.infer<typeof ClosingLockSourceSchema>;

export const ClosingPeriodMonthQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  organizationUnitId: IdSchema.optional(),
});
export type ClosingPeriodMonthQuery = z.infer<typeof ClosingPeriodMonthQuerySchema>;

export const ClosingBookingCorrectionSchema = z.object({
  workflowId: IdSchema,
  personId: IdSchema,
  timeTypeId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  reason: z.string().min(10).max(1000),
  note: z.string().max(1000).optional(),
});
export type ClosingBookingCorrection = z.infer<typeof ClosingBookingCorrectionSchema>;
