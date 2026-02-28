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

export const AbsenceStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
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
  entitlement: PositiveDecimalSchema,
  used: PositiveDecimalSchema,
  remaining: z.number(),
  carriedOver: PositiveDecimalSchema,
  forfeited: PositiveDecimalSchema,
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;
