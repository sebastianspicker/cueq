import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

// ---------------------------------------------------------------------------
// On-Call Domain Schemas — CueQ Differentiator C
// Models on-call rotations and incident/deployment entries
// with optional ticket/event references and compliance checks.
// ---------------------------------------------------------------------------

/** On-call rotation assignment */
export const OnCallRotationSchema = z.object({
  id: IdSchema,
  personId: IdSchema,
  organizationUnitId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema,
  rotationType: z.enum(['WEEKLY', 'DAILY', 'CUSTOM']),
  note: z.string().nullable().optional(),
});
export type OnCallRotation = z.infer<typeof OnCallRotationSchema>;

export const CreateOnCallRotationSchema = z
  .object({
    personId: IdSchema,
    organizationUnitId: IdSchema,
    startTime: DateTimeSchema,
    endTime: DateTimeSchema,
    rotationType: z.enum(['WEEKLY', 'DAILY', 'CUSTOM']),
    note: z.string().max(1000).optional(),
  })
  .refine((input) => input.startTime < input.endTime, {
    message: 'startTime must be before endTime',
    path: ['endTime'],
  });
export type CreateOnCallRotation = z.infer<typeof CreateOnCallRotationSchema>;

export const UpdateOnCallRotationSchema = z
  .object({
    startTime: DateTimeSchema.optional(),
    endTime: DateTimeSchema.optional(),
    rotationType: z.enum(['WEEKLY', 'DAILY', 'CUSTOM']).optional(),
    note: z.string().max(1000).nullable().optional(),
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
export type UpdateOnCallRotation = z.infer<typeof UpdateOnCallRotationSchema>;

export const ListOnCallRotationsQuerySchema = z.object({
  personId: IdSchema.optional(),
  organizationUnitId: IdSchema.optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
});
export type ListOnCallRotationsQuery = z.infer<typeof ListOnCallRotationsQuerySchema>;

export const ListOnCallDeploymentsQuerySchema = z.object({
  personId: IdSchema.optional(),
  organizationUnitId: IdSchema.optional(),
  from: DateTimeSchema.optional(),
  to: DateTimeSchema.optional(),
});
export type ListOnCallDeploymentsQuery = z.infer<typeof ListOnCallDeploymentsQuerySchema>;

/** An individual deployment/callout during on-call */
export const OnCallDeploymentSchema = z.object({
  id: IdSchema,
  rotationId: IdSchema,
  personId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema.nullable(),
  remote: z.boolean().default(true),
  ticketReference: z.string().max(200).nullable().optional(),
  eventReference: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type OnCallDeployment = z.infer<typeof OnCallDeploymentSchema>;

/** Create a new deployment entry */
export const CreateOnCallDeploymentSchema = z
  .object({
    rotationId: IdSchema,
    personId: IdSchema,
    startTime: DateTimeSchema,
    endTime: DateTimeSchema.optional(),
    remote: z.boolean().default(true),
    ticketReference: z.string().max(200).optional(),
    eventReference: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((input) => !input.endTime || input.startTime < input.endTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateOnCallDeployment = z.infer<typeof CreateOnCallDeploymentSchema>;

/** Compliance check result for on-call rest periods */
export const OnCallComplianceCheckSchema = z.object({
  personId: IdSchema,
  date: z.string().date(),
  restHoursAfterDeployment: z.number(),
  requiredRestHours: z.number(),
  compliant: z.boolean(),
  violation: z.string().nullable(),
});
export type OnCallComplianceCheck = z.infer<typeof OnCallComplianceCheckSchema>;

/** Query parameters for on-call rest compliance check */
export const OnCallComplianceQuerySchema = z.object({
  personId: IdSchema.optional(),
  nextShiftStart: DateTimeSchema.optional(),
});
export type OnCallComplianceQuery = z.infer<typeof OnCallComplianceQuerySchema>;
