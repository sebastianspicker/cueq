/** Shared date-range query schemas for operational reporting families. */
import { z } from 'zod';
import { DateSchema, IdSchema } from './common.js';

const OrganizationDateRangeQuerySchema = z
  .object({
    organizationUnitId: IdSchema.optional(),
    from: DateSchema,
    to: DateSchema,
  })
  .refine((input) => input.to >= input.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });

export const TeamAbsenceQuerySchema = OrganizationDateRangeQuerySchema;
export type TeamAbsenceQuery = z.infer<typeof TeamAbsenceQuerySchema>;

export const OeOvertimeQuerySchema = OrganizationDateRangeQuerySchema;
export type OeOvertimeQuery = z.infer<typeof OeOvertimeQuerySchema>;

export const ClosingCompletionQuerySchema = OrganizationDateRangeQuerySchema;
export type ClosingCompletionQuery = z.infer<typeof ClosingCompletionQuerySchema>;
