/** Explicit appointment, effective-term, and scoped-capability HTTP contracts. */
import { z } from 'zod';
import { CursorPageSchema, CursorQuerySchema, DateTimeSchema, IdSchema } from './common.js';

export const AssignmentQuerySchema = CursorQuerySchema.extend({
  personId: IdSchema.optional(),
  at: DateTimeSchema.optional(),
});

export const AssignmentContextSchema = z.object({ assignmentId: IdSchema.optional() });
export const AssignmentOptionSchema = z.object({
  id: IdSchema,
  label: z.string(),
  legacy: z.boolean(),
  active: z.boolean(),
});
export const AssignmentOptionPageSchema = CursorPageSchema(AssignmentOptionSchema);

export const EmploymentTermSchema = z.object({
  id: IdSchema,
  effectiveFrom: DateTimeSchema.nullable(),
  effectiveTo: DateTimeSchema.nullable(),
  organizationUnitId: IdSchema,
  supervisorId: IdSchema.nullable(),
  workTimeModelId: IdSchema.nullable(),
  weeklyHours: z.number().nonnegative().nullable(),
  dailyTargetHours: z.number().nonnegative().nullable(),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  employmentGroupId: IdSchema,
  holidayCalendarId: IdSchema,
  policyReferences: z.record(z.string().max(200)),
});

export const EmploymentAssignmentSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  sourceSystem: z.string(),
  externalAppointmentId: z.string().nullable(),
  label: z.string(),
  legacy: z.boolean(),
  employmentStartDate: DateTimeSchema.nullable(),
  employmentEndDate: DateTimeSchema.nullable(),
  terms: z.array(EmploymentTermSchema),
  termsNextCursor: z.string().nullable(),
  createdAt: DateTimeSchema,
});
export type EmploymentAssignment = z.infer<typeof EmploymentAssignmentSchema>;
export const EmploymentAssignmentPageSchema = CursorPageSchema(EmploymentAssignmentSchema);

export const CreateEmploymentTermSchema = EmploymentTermSchema.omit({ id: true })
  .extend({
    effectiveFrom: DateTimeSchema,
    weeklyHours: z.number().positive().max(168),
    dailyTargetHours: z.number().nonnegative().max(24),
  })
  .refine(
    (term) => !term.effectiveTo || Date.parse(term.effectiveFrom) < Date.parse(term.effectiveTo),
    {
      message: 'effectiveTo must be after effectiveFrom',
      path: ['effectiveTo'],
    },
  );

export const CreateEmploymentAssignmentSchema = z.object({
  personId: IdSchema,
  sourceSystem: z.string().min(1).max(100),
  externalAppointmentId: z.string().min(1).max(200).nullable(),
  label: z.string().min(1).max(200),
  employmentStartDate: DateTimeSchema.nullable(),
  employmentEndDate: DateTimeSchema.nullable(),
  term: CreateEmploymentTermSchema,
});

export const HrCapabilitySchema = z.enum([
  'personnel.read',
  'personnel.manage',
  'profile.request',
  'profile.approve',
  'projects.read',
  'projects.manage',
  'projects.allocate',
  'lifecycle.manage',
  'tasks.read',
  'tasks.complete',
  'documents.read',
  'documents.manage',
  'documents.acknowledge',
  'hr.reconcile',
]);
export type HrCapability = z.infer<typeof HrCapabilitySchema>;
export const CapabilityScopeSchema = z.enum([
  'SELF',
  'PERSON',
  'ORGANIZATION',
  'PROJECT',
  'GLOBAL',
]);
export const CreateCapabilityGrantSchema = z
  .object({
    granteeId: IdSchema,
    capability: HrCapabilitySchema,
    scope: CapabilityScopeSchema,
    targetId: IdSchema.nullable(),
    activeFrom: DateTimeSchema,
    activeTo: DateTimeSchema.nullable(),
    reason: z.string().min(1).max(1000),
  })
  .superRefine((grant, ctx) => {
    if ((grant.scope === 'SELF' || grant.scope === 'GLOBAL') !== (grant.targetId === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetId'],
        message: 'Target does not match scope',
      });
    }
    if (grant.activeTo && Date.parse(grant.activeTo) <= Date.parse(grant.activeFrom)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeTo'],
        message: 'Invalid grant interval',
      });
    }
  });

export const CreateEmploymentGroupSchema = z
  .object({
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    version: z.number().int().positive(),
    leavePolicy: z.record(z.unknown()),
  })
  .strict();
export const CreateHolidayCalendarSchema = z
  .object({
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    version: z.number().int().positive(),
    holidayDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(1000),
  })
  .strict();

export const CapabilityGrantSchema = z.object({
  id: IdSchema,
  granteeId: IdSchema,
  capability: HrCapabilitySchema,
  scope: CapabilityScopeSchema,
  targetId: IdSchema.nullable(),
  activeFrom: DateTimeSchema,
  activeTo: DateTimeSchema.nullable(),
  grantedById: IdSchema,
  reason: z.string(),
  revokedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const CapabilityGrantPageSchema = CursorPageSchema(CapabilityGrantSchema);
export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>;
export const EmploymentGroupSchema = CreateEmploymentGroupSchema.extend({
  id: IdSchema,
  legacyReference: z.boolean(),
  createdAt: DateTimeSchema,
});
export const HolidayCalendarSchema = CreateHolidayCalendarSchema.extend({
  id: IdSchema,
  legacyReference: z.boolean(),
  createdAt: DateTimeSchema,
});
export const EmploymentGroupPageSchema = CursorPageSchema(EmploymentGroupSchema);
export const HolidayCalendarPageSchema = CursorPageSchema(HolidayCalendarSchema);
export type EmploymentGroup = z.infer<typeof EmploymentGroupSchema>;
export type HolidayCalendar = z.infer<typeof HolidayCalendarSchema>;
export const EmploymentTermPageSchema = CursorPageSchema(EmploymentTermSchema);

export const EmploymentAssignmentRecordSchema = EmploymentAssignmentSchema.omit({
  terms: true,
  termsNextCursor: true,
}).extend({ updatedAt: DateTimeSchema });
