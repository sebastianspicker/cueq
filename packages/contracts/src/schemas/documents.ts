/** Private documents and version acknowledgements; acknowledgements are not signatures. */
import { z } from 'zod';
import { CursorPageSchema, CursorQuerySchema, DateTimeSchema, IdSchema } from './common.js';
export const DocumentMimeTypeSchema = z.enum(['application/pdf', 'image/png', 'image/jpeg']);
export const CreatePersonnelDocumentSchema = z
  .object({
    personId: IdSchema,
    assignmentId: IdSchema,
    title: z.string().trim().min(1).max(200),
    expiresAt: DateTimeSchema.nullable(),
    retainUntil: DateTimeSchema.nullable(),
  })
  .strict();
export const PersonnelDocumentQuerySchema = CursorQuerySchema.extend({
  personId: IdSchema.optional(),
  assignmentId: IdSchema.optional(),
});
export const UploadDocumentVersionQuerySchema = z
  .object({ expectedVersion: z.coerce.number().int().min(0).max(1_000_000) })
  .strict();
export const PersonnelDocumentSchema = CreatePersonnelDocumentSchema.extend({
  id: IdSchema,
  organizationUnitId: IdSchema,
  createdById: IdSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export const PersonnelDocumentDetailSchema = PersonnelDocumentSchema.extend({
  latestVersion: z.number().int().nonnegative(),
});
export const PersonnelDocumentPageSchema = CursorPageSchema(PersonnelDocumentSchema);
export const PersonnelDocumentVersionSchema = z.object({
  id: IdSchema,
  documentId: IdSchema,
  version: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: DocumentMimeTypeSchema,
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  createdAt: DateTimeSchema,
  acknowledgedAt: DateTimeSchema.nullable(),
});
export const PersonnelDocumentVersionPageSchema = CursorPageSchema(PersonnelDocumentVersionSchema);
export const DocumentAcknowledgementSchema = z.object({
  id: IdSchema,
  versionId: IdSchema,
  actorId: IdSchema,
  acknowledgedAt: DateTimeSchema,
});
export type PersonnelDocument = z.infer<typeof PersonnelDocumentSchema>;
export type PersonnelDocumentVersion = z.infer<typeof PersonnelDocumentVersionSchema>;
