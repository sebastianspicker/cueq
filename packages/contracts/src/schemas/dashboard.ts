import { z } from 'zod';
import { IdSchema, DateTimeSchema } from './common.js';
import { BookingPageSchema } from './booking.js';

export const DashboardSummarySchema = z.object({
  personId: IdSchema,
  assignmentId: IdSchema,
  dayStart: DateTimeSchema,
  dayEnd: DateTimeSchema,
  todayBookings: BookingPageSchema,
  todayWorkedMilliseconds: z.number().nonnegative(),
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
