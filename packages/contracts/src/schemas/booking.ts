import { CursorQuerySchema, CursorPageSchema } from './common.js';
/** Runtime contracts for booking creation, correction, and read responses across API and web. */
import { z } from 'zod';
import {
  DateTimeSchema,
  IdSchema,
  isDateTimeInstantBefore,
  validateOptionalDateTimeRange,
} from './common.js';
import { BookingSourceSchema, TimeTypeCategorySchema } from './time-type.js';

export const CreateBookingSchema = z
  .object({
    personId: IdSchema,
    assignmentId: IdSchema.optional(),
    timeTypeId: IdSchema,
    startTime: DateTimeSchema,
    endTime: DateTimeSchema.optional(),
    source: BookingSourceSchema,
    note: z.string().max(1000).optional(),
    shiftId: IdSchema.optional(),
  })
  .refine((input) => !input.endTime || isDateTimeInstantBefore(input.startTime, input.endTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const BookingCorrectionSchema = z
  .object({
    bookingId: IdSchema,
    assignmentId: IdSchema.optional(),
    startTime: DateTimeSchema.optional(),
    endTime: DateTimeSchema.optional(),
    timeTypeId: IdSchema.optional(),
    reason: z.string().min(10, 'Correction reason must be at least 10 characters'),
  })
  .superRefine((input, ctx) =>
    validateOptionalDateTimeRange(input, ctx, 'endTime must be after startTime'),
  );
export type BookingCorrection = z.infer<typeof BookingCorrectionSchema>;

export const BookingSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  assignmentId: IdSchema,
  timeTypeId: IdSchema,
  timeTypeCode: z.string(),
  timeTypeCategory: TimeTypeCategorySchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema.nullable(),
  source: BookingSourceSchema,
  note: z.string().nullable(),
  shiftId: IdSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type Booking = z.infer<typeof BookingSchema>;

export const BookingPageSchema = CursorPageSchema(BookingSchema);
export const BookingQuerySchema = CursorQuerySchema.extend({
  assignmentId: IdSchema.optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
}).refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
  message: 'Invalid date range',
});
