import { z } from 'zod';
import { DateSchema, DateTimeSchema, IdSchema, PositiveDecimalSchema } from './common';

// ---------------------------------------------------------------------------
// Absence & Leave schemas
// ---------------------------------------------------------------------------

export const AbsenceTypeSchema = z.enum([
  'ANNUAL_LEAVE',
  'SICK',
  'SPECIAL_LEAVE',
  'TRAINING',
  'TRAVEL',
  'COMP_TIME',
  'FLEX_DAY',
  'UNPAID',
  'PARENTAL',
]);
export type AbsenceType = z.infer<typeof AbsenceTypeSchema>;

export const AbsenceStatusSchema = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type AbsenceStatus = z.infer<typeof AbsenceStatusSchema>;

/** Schema for requesting a new absence / leave */
export const CreateAbsenceSchema = z
  .object({
    personId: IdSchema,
    type: AbsenceTypeSchema,
    startDate: DateSchema,
    endDate: DateSchema,
    note: z.string().max(1000).optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });
export type CreateAbsence = z.infer<typeof CreateAbsenceSchema>;

/** Schema for an absence response (read) */
export const AbsenceSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  type: AbsenceTypeSchema,
  startDate: DateSchema,
  endDate: DateSchema,
  days: PositiveDecimalSchema,
  status: AbsenceStatusSchema,
  note: z.string().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type Absence = z.infer<typeof AbsenceSchema>;

/** Leave balance for a person */
export const LeaveBalanceSchema = z.object({
  personId: IdSchema,
  year: z.number().int(),
  asOfDate: DateSchema,
  entitlement: PositiveDecimalSchema,
  used: PositiveDecimalSchema,
  remaining: z.number(),
  carriedOver: PositiveDecimalSchema,
  carriedOverUsed: PositiveDecimalSchema,
  forfeited: PositiveDecimalSchema,
  adjustments: z.number(),
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;

/** HR leave adjustment entry */
export const LeaveAdjustmentSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  year: z.number().int(),
  deltaDays: z.number(),
  reason: z.string(),
  createdBy: z.string(),
  createdAt: DateTimeSchema,
});
export type LeaveAdjustment = z.infer<typeof LeaveAdjustmentSchema>;

/** Payload for creating an HR leave adjustment */
export const CreateLeaveAdjustmentSchema = z.object({
  personId: IdSchema,
  year: z.number().int().min(1970).max(2200),
  deltaDays: z.number(),
  reason: z.string().min(1).max(1000),
});
export type CreateLeaveAdjustment = z.infer<typeof CreateLeaveAdjustmentSchema>;

/** Query for listing leave adjustments */
export const LeaveAdjustmentQuerySchema = z.object({
  personId: IdSchema.optional(),
  year: z.coerce.number().int().min(1970).max(2200).optional(),
});
export type LeaveAdjustmentQuery = z.infer<typeof LeaveAdjustmentQuerySchema>;

/** Team calendar query */
export const TeamCalendarQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});
export type TeamCalendarQuery = z.infer<typeof TeamCalendarQuerySchema>;

/** Team calendar entry with role-based redaction semantics */
export const TeamCalendarEntrySchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  personName: z.string(),
  startDate: DateSchema,
  endDate: DateSchema,
  status: AbsenceStatusSchema,
  visibilityStatus: z.literal('ABSENT'),
  type: AbsenceTypeSchema.optional(),
  note: z.string().nullable().optional(),
});
export type TeamCalendarEntry = z.infer<typeof TeamCalendarEntrySchema>;
