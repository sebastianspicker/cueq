import { z } from 'zod';

// ---------------------------------------------------------------------------
// Time Type schemas — mirrors the TimeType and TimeTypeCategory enums
// from the Prisma schema, but as runtime-validatable Zod schemas.
// ---------------------------------------------------------------------------

export const TimeTypeCategorySchema = z.enum([
  'WORK',
  'PAUSE',
  'ON_CALL',
  'DEPLOYMENT',
  'ERRAND',
  'HOME_OFFICE',
  'TRAINING',
  'TRAVEL',
]);
export type TimeTypeCategory = z.infer<typeof TimeTypeCategorySchema>;

export const BookingSourceSchema = z.enum([
  'TERMINAL',
  'WEB',
  'MOBILE',
  'IMPORT',
  'MANUAL',
  'CORRECTION',
]);
export type BookingSource = z.infer<typeof BookingSourceSchema>;

export const TimeTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameEn: z.string().nullable().optional(),
  category: TimeTypeCategorySchema,
  isActive: z.boolean(),
});
export type TimeType = z.infer<typeof TimeTypeSchema>;
