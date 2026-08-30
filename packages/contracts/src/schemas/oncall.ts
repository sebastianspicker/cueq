/** Runtime contracts for on-call rotations, deployments, and rest-compliance evaluation. */
import { z } from 'zod';
import {
  DateTimeSchema,
  IdSchema,
  isDateTimeInstantBefore,
  validateOptionalDateTimeQueryRange,
  validateOptionalDateTimeRange,
} from './common.js';
import { RuleViolationSchema } from './time-engine.js';

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
  .refine((input) => isDateTimeInstantBefore(input.startTime, input.endTime), {
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
  .superRefine((input, ctx) =>
    validateOptionalDateTimeRange(input, ctx, 'startTime must be before endTime'),
  );
export type UpdateOnCallRotation = z.infer<typeof UpdateOnCallRotationSchema>;

const ListOnCallQuerySchema = z
  .object({
    personId: IdSchema.optional(),
    organizationUnitId: IdSchema.optional(),
    from: DateTimeSchema.optional(),
    to: DateTimeSchema.optional(),
  })
  .superRefine((input, ctx) =>
    validateOptionalDateTimeQueryRange(input, ctx, 'from must be on or before to'),
  );

export const ListOnCallRotationsQuerySchema = ListOnCallQuerySchema;
export type ListOnCallRotationsQuery = z.infer<typeof ListOnCallRotationsQuerySchema>;

export const ListOnCallDeploymentsQuerySchema = ListOnCallQuerySchema;
export type ListOnCallDeploymentsQuery = z.infer<typeof ListOnCallDeploymentsQuerySchema>;

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
  .refine((input) => !input.endTime || isDateTimeInstantBefore(input.startTime, input.endTime), {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateOnCallDeployment = z.infer<typeof CreateOnCallDeploymentSchema>;

export const OnCallComplianceCheckSchema = z.object({
  personId: IdSchema,
  rotationId: IdSchema.nullable(),
  restHoursAfterDeployment: z.number(),
  minimumRestHours: z.number(),
  compliant: z.boolean(),
  violations: z.array(RuleViolationSchema),
});
export type OnCallComplianceCheck = z.infer<typeof OnCallComplianceCheckSchema>;

export const OnCallComplianceQuerySchema = z.object({
  personId: IdSchema.optional(),
  nextShiftStart: DateTimeSchema.optional(),
});
export type OnCallComplianceQuery = z.infer<typeof OnCallComplianceQuerySchema>;
