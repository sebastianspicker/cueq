/** Common identifiers, dates, pagination, success, and error contracts shared across layers. */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Common value objects used across the domain
// ---------------------------------------------------------------------------

/** CUID identifier */
export const IdSchema = z.string().cuid();

/** ISO 8601 datetime string */
export const DateTimeSchema = z.string().datetime();

/**
 * Compares validated ISO 8601 datetime strings by their instant, not their
 * textual representation. ISO fractions are variable-width, so lexical order
 * is not a safe ordering relation (for example, `...:00Z` sorts after
 * `...:00.001Z`).
 */
export const compareDateTimeInstants = (left: string, right: string): number =>
  Date.parse(left) - Date.parse(right);

/** Test strict temporal ordering after parsing both ISO strings as instants. */
export const isDateTimeInstantBefore = (left: string, right: string): boolean =>
  compareDateTimeInstants(left, right) < 0;

/** Test inclusive temporal ordering after parsing both ISO strings as instants. */
export const isDateTimeInstantOnOrBefore = (left: string, right: string): boolean =>
  compareDateTimeInstants(left, right) <= 0;

/** Add a range issue when both optional start/end timestamps exist in the wrong order. */
export function validateOptionalDateTimeRange(
  input: { startTime?: string; endTime?: string },
  ctx: z.RefinementCtx,
  message: string,
): void {
  if (
    input.startTime &&
    input.endTime &&
    !isDateTimeInstantBefore(input.startTime, input.endTime)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['endTime'] });
  }
}

/** Add a range issue when both optional from/to timestamps exist in reverse order. */
export function validateOptionalDateTimeQueryRange(
  input: { from?: string; to?: string },
  ctx: z.RefinementCtx,
  message: string,
): void {
  if (input.from && input.to && !isDateTimeInstantOnOrBefore(input.from, input.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['to'] });
  }
}

/** ISO 8601 date string (YYYY-MM-DD) */
export const DateSchema = z.string().date();

/** Time string (HH:MM) */
export const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format');

/** Positive decimal (for hours, days) */
export const PositiveDecimalSchema = z.number().nonnegative();

/** Date range */
export const DateRangeSchema = z
  .object({
    start: DateTimeSchema,
    end: DateTimeSchema,
  })
  .refine((value) => isDateTimeInstantBefore(value.start, value.end), {
    message: 'start must be before end',
    path: ['end'],
  });
export type DateRange = z.infer<typeof DateRangeSchema>;

/** Pagination parameters */
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/** Paginated response wrapper: generic, cannot be expressed as a Zod schema */
// eslint-disable-next-line cueq/no-manual-schema-types
export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

/** Standard API error response */
export const ApiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  details: z.array(z.string()).optional(),
  correlationId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Sanitized subset retained at the browser boundary for structured API errors.
 * Unknown response fields are deliberately stripped so arbitrary server bodies
 * are never kept in client error objects.
 */
export const SafeApiErrorPayloadSchema = z.object({
  statusCode: z.number().int().optional(),
  error: z.string().max(200).optional(),
  code: z.string().max(200).optional(),
  message: z.string().max(2000),
  correlationId: z.string().max(200).optional(),
  periodEnd: DateTimeSchema.optional(),
  retryable: z.boolean().optional(),
});
export type SafeApiErrorPayload = z.infer<typeof SafeApiErrorPayloadSchema>;

/** Explicit success contract for mutation endpoints that return no JSON body. */
export const EmptyResponseSchema = z.null();
export type EmptyResponse = z.infer<typeof EmptyResponseSchema>;

/** Minimal authenticated-user projection shared by browser workspace screens. */
export const UserIdentitySchema = z.object({
  id: IdSchema,
});
export type UserIdentity = z.infer<typeof UserIdentitySchema>;

export const UserProfileSchema = UserIdentitySchema.extend({
  email: z.string().email(),
  role: z.enum([
    'EMPLOYEE',
    'TEAM_LEAD',
    'SHIFT_PLANNER',
    'HR',
    'PAYROLL',
    'ADMIN',
    'DATA_PROTECTION',
    'WORKS_COUNCIL',
  ]),
  organizationUnitId: IdSchema,
  firstName: z.string(),
  lastName: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const DashboardSummarySchema = z.object({
  personId: IdSchema,
  modelName: z.string(),
  todayTargetHours: z.number(),
  currentBalanceHours: z.number(),
  todayBookingsCount: z.number().int().nonnegative(),
  hasFirstBooking: z.boolean(),
  showOrientation: z.boolean(),
  clockInTimeTypeId: IdSchema.nullable(),
  period: z
    .object({
      start: DateTimeSchema,
      end: DateTimeSchema,
    })
    .nullable(),
  quickActions: z.array(z.string()),
  now: DateTimeSchema,
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
