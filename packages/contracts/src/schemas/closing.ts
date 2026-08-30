/** Runtime contracts for monthly-closing lifecycle, checklist, correction, and export data. */
import { z } from 'zod';
import { DateTimeSchema, IdSchema, isDateTimeInstantBefore } from './common.js';

export const ClosingStatusSchema = z.enum(['OPEN', 'REVIEW', 'APPROVED', 'EXPORTED']);
export type ClosingStatus = z.infer<typeof ClosingStatusSchema>;

export const ClosingLockSourceSchema = z.enum([
  'AUTO_CUTOFF',
  'MANUAL_REVIEW_START',
  'HR_CORRECTION',
]);
export type ClosingLockSource = z.infer<typeof ClosingLockSourceSchema>;

export const ClosingPeriodMonthQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    organizationUnitId: IdSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.from && input.to && input.from > input.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'to must be on or after from',
        path: ['to'],
      });
    }
  });
export type ClosingPeriodMonthQuery = z.infer<typeof ClosingPeriodMonthQuerySchema>;

export const ClosingBookingCorrectionSchema = z
  .object({
    workflowId: IdSchema,
    personId: IdSchema,
    timeTypeId: IdSchema,
    startTime: DateTimeSchema,
    endTime: DateTimeSchema,
    reason: z.string().min(10).max(1000),
    note: z.string().max(1000).optional(),
  })
  .refine((input) => isDateTimeInstantBefore(input.startTime, input.endTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type ClosingBookingCorrection = z.infer<typeof ClosingBookingCorrectionSchema>;

export const ClosingExportRunSchema = z.object({
  id: IdSchema,
  format: z.string(),
  recordCount: z.number().int().nonnegative(),
  checksum: z.string(),
  exportedAt: DateTimeSchema,
});

export const ClosingPeriodSchema = z.object({
  id: IdSchema,
  organizationUnitId: IdSchema.nullable(),
  periodStart: DateTimeSchema,
  periodEnd: DateTimeSchema,
  status: ClosingStatusSchema,
  exportRuns: z.array(ClosingExportRunSchema),
  leadApprovedAt: DateTimeSchema.nullable().optional(),
  leadApprovedById: IdSchema.nullable().optional(),
  hrApprovedAt: DateTimeSchema.nullable().optional(),
  hrApprovedById: IdSchema.nullable().optional(),
  lockedAt: DateTimeSchema.nullable().optional(),
  lockSource: ClosingLockSourceSchema.nullable().optional(),
});
export type ClosingPeriod = z.infer<typeof ClosingPeriodSchema>;
export const ClosingPeriodMutationResponseSchema = ClosingPeriodSchema.omit({
  exportRuns: true,
});

export const ClosingChecklistItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  severity: z.string(),
  status: z.string(),
  details: z.string(),
});
export const ClosingChecklistResponseSchema = z.object({
  closingPeriodId: IdSchema,
  status: z.string(),
  hasErrors: z.boolean(),
  items: z.array(ClosingChecklistItemSchema),
});

export const PayrollExportRowSchema = z.object({
  personId: IdSchema,
  targetHours: z.number(),
  actualHours: z.number(),
  balance: z.number(),
});

export const ClosingExportResponseSchema = z.object({
  exportRun: ClosingExportRunSchema.extend({
    closingPeriodId: IdSchema,
    artifact: z.string().nullable(),
    contentType: z.string().nullable(),
    exportedById: IdSchema,
  }),
  checksum: z.string(),
  csv: z.string().nullable(),
  artifact: z.string(),
  contentType: z.string(),
  rows: z.array(PayrollExportRowSchema),
});

export const ClosingBookingCorrectionResponseSchema = z.object({
  id: IdSchema,
  closingPeriodId: IdSchema,
  workflowId: IdSchema,
  personId: IdSchema,
  timeTypeId: IdSchema,
  timeTypeCode: z.string(),
  timeTypeCategory: z.string(),
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  source: z.string(),
  note: z.string().nullable(),
  durationHours: z.number(),
});

export const ClosingPeriodLockedErrorSchema = z.object({
  code: z.literal('CLOSING_PERIOD_LOCKED'),
  periodEnd: DateTimeSchema,
});
export type ClosingPeriodLockedError = z.infer<typeof ClosingPeriodLockedErrorSchema>;

export const ExportFormatSchema = z.enum(['CSV_V1', 'XML_V1']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ClosingExportRequestSchema = z.object({
  format: ExportFormatSchema.default('CSV_V1').optional(),
});
export type ClosingExportRequest = z.infer<typeof ClosingExportRequestSchema>;

/** Payload for creating a post-close correction workflow */
export const PostCloseCorrectionRequestSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type PostCloseCorrectionRequest = z.infer<typeof PostCloseCorrectionRequestSchema>;
