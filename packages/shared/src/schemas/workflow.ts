import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

// ---------------------------------------------------------------------------
// Workflow & Approval schemas
// ---------------------------------------------------------------------------

export const WorkflowTypeSchema = z.enum([
  'LEAVE_REQUEST',
  'BOOKING_CORRECTION',
  'SHIFT_SWAP',
  'OVERTIME_APPROVAL',
  'POST_CLOSE_CORRECTION',
]);
export type WorkflowType = z.infer<typeof WorkflowTypeSchema>;

export const WorkflowStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
  'CANCELLED',
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

/** Schema for a workflow instance (read) */
export const WorkflowInstanceSchema = z.object({
  id: IdSchema,
  type: WorkflowTypeSchema,
  status: WorkflowStatusSchema,
  requesterId: IdSchema,
  approverId: IdSchema.nullable(),
  entityType: z.string(),
  entityId: IdSchema,
  reason: z.string().nullable(),
  decidedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

/** Schema for approving or rejecting a workflow */
export const WorkflowDecisionSchema = z.object({
  workflowId: IdSchema,
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().max(1000).optional(),
});
export type WorkflowDecision = z.infer<typeof WorkflowDecisionSchema>;
