import { z } from 'zod';
import { DateSchema, IdSchema } from './common';

export const ReportSuppressionSchema = z.object({
  suppressed: z.boolean(),
  minGroupSize: z.number().int().positive(),
  population: z.number().int().nonnegative(),
});
export type ReportSuppression = z.infer<typeof ReportSuppressionSchema>;

export const TeamAbsenceBucketSchema = z.object({
  type: z.string(),
  days: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
});
export type TeamAbsenceBucket = z.infer<typeof TeamAbsenceBucketSchema>;

export const TeamAbsenceReportSchema = z.object({
  organizationUnitId: IdSchema,
  from: DateSchema,
  to: DateSchema,
  suppression: ReportSuppressionSchema,
  totals: z.object({
    requests: z.number().int().nonnegative(),
    days: z.number().nonnegative(),
  }),
  buckets: z.array(TeamAbsenceBucketSchema),
});
export type TeamAbsenceReport = z.infer<typeof TeamAbsenceReportSchema>;

export const OeOvertimeReportSchema = z.object({
  organizationUnitId: IdSchema,
  from: DateSchema,
  to: DateSchema,
  suppression: ReportSuppressionSchema,
  totals: z.object({
    people: z.number().int().nonnegative(),
    totalBalanceHours: z.number(),
    totalOvertimeHours: z.number(),
    avgBalanceHours: z.number(),
  }),
});
export type OeOvertimeReport = z.infer<typeof OeOvertimeReportSchema>;

export const ClosingCompletionReportSchema = z.object({
  from: DateSchema,
  to: DateSchema,
  totals: z.object({
    periods: z.number().int().nonnegative(),
    exported: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1),
  }),
});
export type ClosingCompletionReport = z.infer<typeof ClosingCompletionReportSchema>;

export const TeamAbsenceQuerySchema = z.object({
  organizationUnitId: IdSchema.optional(),
  from: DateSchema,
  to: DateSchema,
});
export type TeamAbsenceQuery = z.infer<typeof TeamAbsenceQuerySchema>;

export const OeOvertimeQuerySchema = z.object({
  organizationUnitId: IdSchema.optional(),
  from: DateSchema,
  to: DateSchema,
});
export type OeOvertimeQuery = z.infer<typeof OeOvertimeQuerySchema>;

export const ClosingCompletionQuerySchema = z.object({
  from: DateSchema,
  to: DateSchema,
});
export type ClosingCompletionQuery = z.infer<typeof ClosingCompletionQuerySchema>;
