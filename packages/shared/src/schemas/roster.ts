import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

export const RosterStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);
export type RosterStatus = z.infer<typeof RosterStatusSchema>;

export const CreateRosterSchema = z
  .object({
    organizationUnitId: IdSchema,
    periodStart: DateTimeSchema,
    periodEnd: DateTimeSchema,
  })
  .refine((input) => input.periodStart < input.periodEnd, {
    message: 'periodStart must be before periodEnd',
    path: ['periodEnd'],
  });
export type CreateRoster = z.infer<typeof CreateRosterSchema>;

export const CreateShiftSchema = z
  .object({
    startTime: DateTimeSchema,
    endTime: DateTimeSchema,
    shiftType: z.string().min(1).max(100),
    minStaffing: z.number().int().min(1),
  })
  .refine((input) => input.startTime < input.endTime, {
    message: 'startTime must be before endTime',
    path: ['endTime'],
  });
export type CreateShift = z.infer<typeof CreateShiftSchema>;

export const UpdateShiftSchema = z
  .object({
    startTime: DateTimeSchema.optional(),
    endTime: DateTimeSchema.optional(),
    shiftType: z.string().min(1).max(100).optional(),
    minStaffing: z.number().int().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.startTime && input.endTime && input.startTime >= input.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be before endTime',
        path: ['endTime'],
      });
    }
  });
export type UpdateShift = z.infer<typeof UpdateShiftSchema>;

export const AssignShiftSchema = z.object({
  personId: IdSchema,
});
export type AssignShift = z.infer<typeof AssignShiftSchema>;

export const ShiftAssignmentSchema = z.object({
  id: IdSchema,
  shiftId: IdSchema,
  personId: IdSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type ShiftAssignment = z.infer<typeof ShiftAssignmentSchema>;

export const RosterAssignmentDetailSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  firstName: z.string(),
  lastName: z.string(),
});
export type RosterAssignmentDetail = z.infer<typeof RosterAssignmentDetailSchema>;

export const RosterShiftDetailSchema = z.object({
  id: IdSchema,
  rosterId: IdSchema,
  personId: IdSchema.nullable(),
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  shiftType: z.string(),
  minStaffing: z.number().int().min(1),
  assignments: z.array(RosterAssignmentDetailSchema),
});
export type RosterShiftDetail = z.infer<typeof RosterShiftDetailSchema>;

export const RosterMemberSchema = z.object({
  id: IdSchema,
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
});
export type RosterMember = z.infer<typeof RosterMemberSchema>;

export const RosterDetailSchema = z.object({
  id: IdSchema,
  organizationUnitId: IdSchema,
  periodStart: DateTimeSchema,
  periodEnd: DateTimeSchema,
  status: RosterStatusSchema,
  publishedAt: DateTimeSchema.nullable(),
  shifts: z.array(RosterShiftDetailSchema),
  members: z.array(RosterMemberSchema),
});
export type RosterDetail = z.infer<typeof RosterDetailSchema>;

export const PlanVsActualSlotSchema = z.object({
  shiftId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  shiftType: z.string(),
  minStaffing: z.number().int().min(1),
  assignedHeadcount: z.number().int().min(0),
  plannedHeadcount: z.number().int().min(0),
  actualHeadcount: z.number().int().min(0),
  delta: z.number().int(),
  compliant: z.boolean(),
});
export type PlanVsActualSlot = z.infer<typeof PlanVsActualSlotSchema>;

export const PlanVsActualResponseSchema = z.object({
  rosterId: IdSchema,
  periodStart: DateTimeSchema,
  periodEnd: DateTimeSchema,
  totalSlots: z.number().int().min(0),
  mismatchedSlots: z.number().int().min(0),
  complianceRate: z.number().min(0).max(1),
  understaffedSlots: z.number().int().min(0),
  coverageRate: z.number().min(0).max(1),
  slots: z.array(PlanVsActualSlotSchema),
});
export type PlanVsActualResponse = z.infer<typeof PlanVsActualResponseSchema>;
