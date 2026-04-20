import { z } from 'zod';
import { DateSchema, DateTimeSchema, IdSchema } from './common';

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
  organizationUnitId: IdSchema.nullable().optional(),
  totals: z.object({
    periods: z.number().int().nonnegative(),
    exported: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1),
  }),
});
export type ClosingCompletionReport = z.infer<typeof ClosingCompletionReportSchema>;

export const TeamAbsenceQuerySchema = z
  .object({
    organizationUnitId: IdSchema.optional(),
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type TeamAbsenceQuery = z.infer<typeof TeamAbsenceQuerySchema>;

export const OeOvertimeQuerySchema = z
  .object({
    organizationUnitId: IdSchema.optional(),
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type OeOvertimeQuery = z.infer<typeof OeOvertimeQuerySchema>;

export const ClosingCompletionQuerySchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type ClosingCompletionQuery = z.infer<typeof ClosingCompletionQuerySchema>;

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

export const AuditSummaryQuerySchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type AuditSummaryQuery = z.infer<typeof AuditSummaryQuerySchema>;

export const ComplianceSummaryQuerySchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type ComplianceSummaryQuery = z.infer<typeof ComplianceSummaryQuerySchema>;

export const CustomReportTypeSchema = z.enum(['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION']);
export type CustomReportType = z.infer<typeof CustomReportTypeSchema>;

export const CustomReportGroupBySchema = z.enum(['ORGANIZATION_UNIT', 'NONE']);
export type CustomReportGroupBy = z.infer<typeof CustomReportGroupBySchema>;

export const CustomReportMetricSchema = z.enum([
  'requests',
  'days',
  'people',
  'totalOvertimeHours',
  'completionRate',
  'exported',
]);
export type CustomReportMetric = z.infer<typeof CustomReportMetricSchema>;

export const CustomReportOptionsSchema = z.object({
  reportTypes: z.array(CustomReportTypeSchema),
  groupBy: z.array(CustomReportGroupBySchema),
  metrics: z.array(CustomReportMetricSchema),
});
export type CustomReportOptions = z.infer<typeof CustomReportOptionsSchema>;

export const CustomReportPreviewQuerySchema = z
  .object({
    reportType: CustomReportTypeSchema,
    groupBy: CustomReportGroupBySchema,
    metrics: z.array(CustomReportMetricSchema).min(1).max(4),
    from: DateSchema,
    to: DateSchema,
    organizationUnitId: IdSchema.optional(),
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type CustomReportPreviewQuery = z.infer<typeof CustomReportPreviewQuerySchema>;

/** Query-param version with string-to-array coercion for GET requests */
export const CustomReportPreviewQueryParamsSchema = z
  .object({
    reportType: CustomReportTypeSchema,
    groupBy: CustomReportGroupBySchema,
    metrics: z.preprocess(
      (val) => (typeof val === 'string' ? [val] : val),
      z.array(CustomReportMetricSchema).min(1).max(4),
    ),
    from: DateSchema,
    to: DateSchema,
    organizationUnitId: IdSchema.optional(),
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });
export type CustomReportPreviewQueryParams = z.infer<typeof CustomReportPreviewQueryParamsSchema>;

export const CustomReportPreviewRowSchema = z.object({
  group: z.string(),
  metrics: z.record(z.number()),
});
export type CustomReportPreviewRow = z.infer<typeof CustomReportPreviewRowSchema>;

export const CustomReportPreviewSchema = z.object({
  reportType: CustomReportTypeSchema,
  groupBy: CustomReportGroupBySchema,
  from: DateSchema,
  to: DateSchema,
  suppression: ReportSuppressionSchema.optional(),
  rows: z.array(CustomReportPreviewRowSchema),
});
export type CustomReportPreview = z.infer<typeof CustomReportPreviewSchema>;

// ---------------------------------------------------------------------------
// Audit Entries — filterable browse endpoint
// ---------------------------------------------------------------------------

export const AuditEntriesQuerySchema = z.object({
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
  action: z.string().max(64).optional(),
  entityType: z.string().max(64).optional(),
  actorId: IdSchema.optional(),
  entityId: IdSchema.optional(),
  skip: z.coerce.number().int().nonnegative().default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditEntriesQuery = z.infer<typeof AuditEntriesQuerySchema>;

export const AuditEntryItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actorId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  reason: z.string().nullable(),
});
export type AuditEntryItem = z.infer<typeof AuditEntryItemSchema>;

export const AuditEntriesResultSchema = z.object({
  items: z.array(AuditEntryItemSchema),
  total: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  take: z.number().int().positive(),
});
export type AuditEntriesResult = z.infer<typeof AuditEntriesResultSchema>;
