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

export const isDateTimeInstantBefore = (left: string, right: string): boolean =>
  compareDateTimeInstants(left, right) < 0;

export const isDateTimeInstantOnOrBefore = (left: string, right: string): boolean =>
  compareDateTimeInstants(left, right) <= 0;

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

/** Paginated response wrapper — generic, cannot be expressed as a Zod schema */
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
