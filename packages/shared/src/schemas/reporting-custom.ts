/** Custom report option, query, and response contracts. */
import { z } from 'zod';
import { DateSchema, IdSchema } from './common.js';
import { ReportSuppressionSchema } from './reporting-family.js';

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

function customReportPreviewQuerySchema<T extends z.ZodTypeAny>(metrics: T) {
  return z
    .object({
      reportType: CustomReportTypeSchema,
      groupBy: CustomReportGroupBySchema,
      metrics,
      from: DateSchema,
      to: DateSchema,
      organizationUnitId: IdSchema.optional(),
    })
    .refine((input) => input.to >= input.from, {
      message: 'to must be on or after from',
      path: ['to'],
    });
}

export const CustomReportPreviewQuerySchema = customReportPreviewQuerySchema(
  z.array(CustomReportMetricSchema).min(1).max(4),
);
export type CustomReportPreviewQuery = z.infer<typeof CustomReportPreviewQuerySchema>;

/** Query-param version with string-to-array coercion for GET requests */
export const CustomReportPreviewQueryParamsSchema = customReportPreviewQuerySchema(
  z.preprocess(
    (val) => (typeof val === 'string' ? [val] : val),
    z.array(CustomReportMetricSchema).min(1).max(4),
  ),
);
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
