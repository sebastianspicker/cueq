/** Aggregate audit and compliance summary contracts and their shared date-range queries. */
import { z } from 'zod';
import { DateSchema, DateTimeSchema } from './common.js';

export const ReportActionCountSchema = z.object({
  action: z.string(),
  count: z.number().int().nonnegative(),
});
export type ReportActionCount = z.infer<typeof ReportActionCountSchema>;

export const ReportEntityTypeCountSchema = z.object({
  entityType: z.string(),
  count: z.number().int().nonnegative(),
});
export type ReportEntityTypeCount = z.infer<typeof ReportEntityTypeCountSchema>;

export const AuditSummaryReportSchema = z.object({
  from: DateSchema,
  to: DateSchema,
  totals: z.object({
    entries: z.number().int().nonnegative(),
    uniqueActors: z.number().int().nonnegative(),
    reportAccesses: z.number().int().nonnegative(),
    exportsTriggered: z.number().int().nonnegative(),
    lockBlocks: z.number().int().nonnegative(),
  }),
  byAction: z.array(ReportActionCountSchema),
  byEntityType: z.array(ReportEntityTypeCountSchema),
});
export type AuditSummaryReport = z.infer<typeof AuditSummaryReportSchema>;

export const ComplianceSummaryReportSchema = z.object({
  from: DateSchema,
  to: DateSchema,
  privacy: z.object({
    minGroupSize: z.number().int().positive(),
    reportAccesses: z.number().int().nonnegative(),
    suppressedReportAccesses: z.number().int().nonnegative(),
    suppressionRate: z.number().min(0).max(1),
  }),
  closing: z.object({
    periods: z.number().int().nonnegative(),
    exported: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1),
    lockBlocks: z.number().int().nonnegative(),
    postCloseCorrections: z.number().int().nonnegative(),
  }),
  payrollExport: z.object({
    runs: z.number().int().nonnegative(),
    uniqueChecksums: z.number().int().nonnegative(),
    duplicateChecksums: z.number().int().nonnegative(),
    lastRunAt: DateTimeSchema.nullable(),
  }),
  operations: z.object({
    lastBackupRestoreVerifiedAt: DateTimeSchema.nullable(),
  }),
});
export type ComplianceSummaryReport = z.infer<typeof ComplianceSummaryReportSchema>;

const SummaryDateRangeQuerySchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });

export const AuditSummaryQuerySchema = SummaryDateRangeQuerySchema;
export type AuditSummaryQuery = z.infer<typeof AuditSummaryQuerySchema>;

export const ComplianceSummaryQuerySchema = SummaryDateRangeQuerySchema;
export type ComplianceSummaryQuery = z.infer<typeof ComplianceSummaryQuerySchema>;
