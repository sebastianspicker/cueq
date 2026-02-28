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
export const CreateOnCallDeploymentSchema = z.object({
  rotationId: IdSchema,
  personId: IdSchema,
  startTime: DateTimeSchema,
  endTime: DateTimeSchema.optional(),
  remote: z.boolean().default(true),
  ticketReference: z.string().max(200).optional(),
  eventReference: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
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
