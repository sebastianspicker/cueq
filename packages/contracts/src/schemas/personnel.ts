/** Native personnel data and revision-checked reconciliation contracts. */
import { z } from 'zod';
import { CursorPageSchema, CursorQuerySchema, DateTimeSchema, IdSchema } from './common.js';

export const PersonnelFieldKeySchema = z.enum([
  'firstName',
  'lastName',
  'preferredName',
  'phone',
  'address',
  'emergencyContact',
]);
export const PersonnelFieldValueSchema = z.string().trim().min(1).max(2000);
export const PersonnelFieldsSchema = z.record(PersonnelFieldKeySchema, PersonnelFieldValueSchema);
export const ProfileChangeStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'PENDING_SYNC',
  'APPLIED',
  'CONFLICT',
  'REJECTED',
]);
export const PersonnelQuerySchema = CursorQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  organizationUnitId: IdSchema.optional(),
});
export const ProfileChangesQuerySchema = CursorQuerySchema.extend({
  personId: IdSchema.optional(),
  status: ProfileChangeStatusSchema.optional(),
});
export const CreateProfileChangeSchema = z
  .object({
    fieldKey: PersonnelFieldKeySchema,
    requestedValue: PersonnelFieldValueSchema,
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const ReviewProfileChangeSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const CreateHrSourceSchema = z
  .object({
    code: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    name: z.string().trim().min(1).max(200),
    ownershipProfile: z.record(PersonnelFieldKeySchema, z.enum(['CUEQ', 'SOURCE'])),
  })
  .strict();
export const ReconcilePersonnelRecordSchema = z
  .object({
    personId: IdSchema,
    externalRecordId: z.string().min(1).max(200),
    expectedSourceRevision: z.string().min(1).max(200).nullable(),
    revision: z.string().min(1).max(200),
    fields: PersonnelFieldsSchema,
  })
  .strict();
export const ReconcilePersonnelSchema = z
  .object({
    records: z.array(ReconcilePersonnelRecordSchema).min(1).max(500),
  })
  .strict();
export const CreatePersonnelRelationshipSchema = z
  .object({
    subjectPersonId: IdSchema,
    relatedPersonId: IdSchema,
    kind: z.enum(['FUNCTIONAL_SUPERVISOR', 'PROJECT_CONTACT', 'MENTOR']),
    effectiveFrom: DateTimeSchema,
    effectiveTo: DateTimeSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.subjectPersonId !== value.relatedPersonId &&
      (!value.effectiveTo || Date.parse(value.effectiveTo) > Date.parse(value.effectiveFrom)),
    { message: 'Invalid relationship or effective interval' },
  );

export const PersonnelDirectoryItemSchema = z.object({
  id: IdSchema,
  firstName: z.string(),
  lastName: z.string(),
  createdAt: DateTimeSchema,
});
export const PersonnelFieldSchema = z.object({
  key: PersonnelFieldKeySchema,
  value: z.string(),
  ownerSystemId: IdSchema.nullable(),
  revision: z.number().int().positive(),
  sourceRevision: z.string().nullable(),
  updatedAt: DateTimeSchema,
});
export const PersonnelProfileSchema = z.object({
  id: IdSchema,
  firstName: z.string(),
  lastName: z.string(),
  fields: z.array(PersonnelFieldSchema),
});
export const ProfileChangeSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  fieldKey: PersonnelFieldKeySchema,
  requestedValue: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  ownerSystemId: IdSchema.nullable(),
  status: ProfileChangeStatusSchema,
  reviewerId: IdSchema.nullable(),
  reviewedAt: DateTimeSchema.nullable(),
  resolvedAt: DateTimeSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export const HrSourceSchema = CreateHrSourceSchema.extend({
  id: IdSchema,
  createdAt: DateTimeSchema,
});
export const PersonnelRelationshipSchema = z.object({
  id: IdSchema,
  subjectPersonId: IdSchema,
  relatedPersonId: IdSchema,
  kind: z.string(),
  effectiveFrom: DateTimeSchema,
  effectiveTo: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const PersonnelOutboundChangeSchema = z.object({
  id: IdSchema,
  requestId: IdSchema,
  sourceSystemId: IdSchema,
  status: ProfileChangeStatusSchema,
  acknowledgedRevision: z.string().nullable(),
  acknowledgedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  request: z.object({
    personId: IdSchema,
    fieldKey: PersonnelFieldKeySchema,
    requestedValue: z.string(),
    expectedRevision: z.number().int(),
  }),
});
export const PersonnelReconciliationResultSchema = z.object({
  items: z.array(
    z.object({
      personId: IdSchema,
      status: z.enum(['APPLIED', 'UNCHANGED']),
      appliedFields: z.number().int(),
      ignoredFields: z.number().int(),
    }),
  ),
});

export const PersonnelDirectoryPageSchema = CursorPageSchema(PersonnelDirectoryItemSchema);

export const ProfileChangePageSchema = CursorPageSchema(ProfileChangeSchema);

export const HrSourcePageSchema = CursorPageSchema(HrSourceSchema);

export const PersonnelRelationshipPageSchema = CursorPageSchema(PersonnelRelationshipSchema);

export const PersonnelOutboundChangePageSchema = CursorPageSchema(PersonnelOutboundChangeSchema);
export type PersonnelDirectoryItem = z.infer<typeof PersonnelDirectoryItemSchema>;
export type PersonnelField = z.infer<typeof PersonnelFieldSchema>;
export type PersonnelProfile = z.infer<typeof PersonnelProfileSchema>;
export type ProfileChange = z.infer<typeof ProfileChangeSchema>;
export type HrSource = z.infer<typeof HrSourceSchema>;
export type PersonnelRelationship = z.infer<typeof PersonnelRelationshipSchema>;
export type PersonnelOutboundChange = z.infer<typeof PersonnelOutboundChangeSchema>;
export type PersonnelReconciliationResult = z.infer<typeof PersonnelReconciliationResultSchema>;

export const ReconcilePersonnelCsvSchema = z
  .object({ csv: z.string().min(1).max(65_536) })
  .strict();

export const PersonnelOrganizationSchema = z.object({
  id: IdSchema,
  name: z.string(),
  parentId: IdSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const PersonnelOrganizationPageSchema = CursorPageSchema(PersonnelOrganizationSchema);
export type PersonnelOrganization = z.infer<typeof PersonnelOrganizationSchema>;
