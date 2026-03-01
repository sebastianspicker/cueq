import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { BookingSourceSchema, TimeTypeCategorySchema } from './time-type';

// ---------------------------------------------------------------------------
// Booking schemas — used for API validation (NestJS) and form validation (Next.js)
// ---------------------------------------------------------------------------

/** Schema for creating a new booking */
export const CreateBookingSchema = z
  .object({
    personId: IdSchema,
    timeTypeId: IdSchema,
    startTime: DateTimeSchema,
    endTime: DateTimeSchema.optional(),
    source: BookingSourceSchema,
    note: z.string().max(1000).optional(),
    shiftId: IdSchema.optional(),
  })
  .refine((input) => !input.endTime || input.endTime > input.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

/** Schema for a booking correction request (requires justification) */
export const BookingCorrectionSchema = z.object({
  bookingId: IdSchema,
  startTime: DateTimeSchema.optional(),
  endTime: DateTimeSchema.optional(),
  timeTypeId: IdSchema.optional(),
  reason: z.string().min(10, 'Correction reason must be at least 10 characters'),
});
export type BookingCorrection = z.infer<typeof BookingCorrectionSchema>;

/** Schema for a booking response (read) */
export const BookingSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
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
