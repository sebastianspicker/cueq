/** Project effort is an allocation of existing attendance, never attendance credit. */
import { z } from 'zod';
import { CursorPageSchema, CursorQuerySchema, DateTimeSchema, IdSchema } from './common.js';
export const ProjectQuerySchema = CursorQuerySchema.extend({
  archived: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional(),
});
export const CreateProjectSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    parentId: IdSchema.nullable(),
    organizationUnitId: IdSchema,
    managerId: IdSchema,
    costCentre: z.string().max(200).nullable(),
    fundingReference: z.string().max(200).nullable(),
    budgetHours: z.number().nonnegative().max(1_000_000_000).nullable(),
  })
  .strict();
export const CreateProjectMembershipSchema = z
  .object({
    personId: IdSchema,
    assignmentId: IdSchema,
    effectiveFrom: DateTimeSchema,
    effectiveTo: DateTimeSchema.nullable(),
  })
  .strict()
  .refine((v) => !v.effectiveTo || Date.parse(v.effectiveTo) > Date.parse(v.effectiveFrom), {
    message: 'Invalid membership interval',
  });
export const AllocateProjectTimeSchema = z
  .object({
    projectId: IdSchema,
    bookingId: IdSchema,
    assignmentId: IdSchema,
    minutes: z.number().int().positive().max(525_600),
    note: z.string().trim().max(2000).nullable(),
  })
  .strict();
export const ProjectTimeQuerySchema = CursorQuerySchema.extend({
  assignmentId: IdSchema,
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
  projectId: IdSchema.optional(),
});
export const ProjectReportQuerySchema = z
  .object({ from: DateTimeSchema, to: DateTimeSchema })
  .strict()
  .refine((v) => Date.parse(v.to) > Date.parse(v.from), { message: 'Invalid report interval' });

export const ProjectSchema = CreateProjectSchema.extend({
  id: IdSchema,
  archivedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export const ProjectPageSchema = CursorPageSchema(ProjectSchema);
export const ProjectMembershipSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  personId: IdSchema,
  assignmentId: IdSchema,
  effectiveFrom: DateTimeSchema,
  effectiveTo: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const ProjectMembershipPageSchema = CursorPageSchema(ProjectMembershipSchema);
export const ProjectAllocationSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  projectCode: z.string().optional(),
  projectName: z.string().optional(),
  bookingId: IdSchema,
  assignmentId: IdSchema,
  personId: IdSchema,
  minutes: z.number().int(),
  note: z.string().nullable(),
  bookingStartTime: DateTimeSchema.optional(),
  bookingEndTime: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export const ProjectAllocationPageSchema = CursorPageSchema(ProjectAllocationSchema);
export const UnallocatedBookingSchema = z.object({
  bookingId: IdSchema,
  assignmentId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  durationMinutes: z.number().int(),
  allocatedMinutes: z.number().int(),
  unallocatedMinutes: z.number().int(),
});
export const UnallocatedBookingPageSchema = CursorPageSchema(UnallocatedBookingSchema);
export const ProjectReportSchema = z.object({
  projectId: IdSchema,
  code: z.string(),
  name: z.string(),
  parentId: IdSchema.nullable(),
  from: DateTimeSchema,
  to: DateTimeSchema,
  suppression: z.object({
    suppressed: z.boolean(),
    minGroupSize: z.number().int(),
    population: z.number().int(),
  }),
  totals: z
    .object({
      budgetHours: z.number().nullable(),
      recordedHours: z.number(),
      varianceHours: z.number().nullable(),
    })
    .nullable(),
});
export const ProjectArchiveSchema = z.object({ id: IdSchema, archivedAt: DateTimeSchema });
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectMembership = z.infer<typeof ProjectMembershipSchema>;
export type ProjectAllocation = z.infer<typeof ProjectAllocationSchema>;
export type UnallocatedBooking = z.infer<typeof UnallocatedBookingSchema>;
export type ProjectReport = z.infer<typeof ProjectReportSchema>;
