/** Filterable audit-entry browse query and response contracts. */
import { z } from 'zod';
import { DateTimeSchema, IdSchema, validateOptionalDateTimeQueryRange } from './common.js';

export const AuditEntriesQuerySchema = z
  .object({
    from: DateTimeSchema.optional(),
    to: DateTimeSchema.optional(),
    action: z.string().max(64).optional(),
    entityType: z.string().max(64).optional(),
    actorId: IdSchema.optional(),
    entityId: IdSchema.optional(),
    skip: z.coerce.number().int().nonnegative().default(0),
    take: z.coerce.number().int().min(1).max(200).default(50),
  })
  .superRefine((input, ctx) =>
    validateOptionalDateTimeQueryRange(input, ctx, 'to must be on or after from'),
  );
export type AuditEntriesQuery = z.infer<typeof AuditEntriesQuerySchema>;

export const AuditEntryItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actorId: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  reason: z.string().nullable(),
});
export type AuditEntryItem = z.infer<typeof AuditEntryItemSchema>;

export const AuditEntriesResultSchema = z.object({
  items: z.array(AuditEntryItemSchema),
  total: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  take: z.number().int().positive(),
});
export type AuditEntriesResult = z.infer<typeof AuditEntriesResultSchema>;
