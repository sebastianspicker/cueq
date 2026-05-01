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
  'DRAFT',
  'SUBMITTED',
  'PENDING',
  'ESCALATED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowActionSchema = z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'DELEGATE', 'CANCEL']);
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export const WorkflowEscalationActionSchema = z.enum(['ESCALATE']);
export type WorkflowEscalationAction = z.infer<typeof WorkflowEscalationActionSchema>;

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
  decisionReason: z.string().nullable().optional(),
  submittedAt: DateTimeSchema.nullable().optional(),
  dueAt: DateTimeSchema.nullable().optional(),
  escalatedAt: DateTimeSchema.nullable().optional(),
  escalationLevel: z.number().int().nonnegative().default(0),
  requestPayload: z.unknown().nullable().optional(),
  delegationTrail: z.array(z.string()).nullable().optional(),
  decidedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

/** Schema for workflow action command with legacy decision compatibility */
export const WorkflowDecisionCommandSchema = z
  .object({
    workflowId: IdSchema,
    action: WorkflowActionSchema.optional(),
    decision: z.enum(['APPROVED', 'REJECTED']).optional(),
    reason: z.string().max(1000).optional(),
    delegateToId: IdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.action && !value.decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action or decision is required',
        path: ['action'],
      });
    }

    if (value.action && value.decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action and decision cannot be provided together',
        path: ['decision'],
      });
    }

    if (value.action === 'DELEGATE' && !value.delegateToId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'delegateToId is required for DELEGATE action',
        path: ['delegateToId'],
      });
    }
  });
export type WorkflowDecisionCommand = z.infer<typeof WorkflowDecisionCommandSchema>;

export const WorkflowInboxQuerySchema = z.object({
  status: WorkflowStatusSchema.optional(),
  type: WorkflowTypeSchema.optional(),
  overdueOnly: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
});
export type WorkflowInboxQuery = z.infer<typeof WorkflowInboxQuerySchema>;

export const WorkflowInboxItemSchema = WorkflowInstanceSchema.extend({
  isOverdue: z.boolean(),
  availableActions: z.array(WorkflowActionSchema),
});
export type WorkflowInboxItem = z.infer<typeof WorkflowInboxItemSchema>;

export const WorkflowApproverRoleSchema = z.enum(['TEAM_LEAD', 'SHIFT_PLANNER', 'HR', 'ADMIN']);
export type WorkflowApproverRole = z.infer<typeof WorkflowApproverRoleSchema>;

export const WorkflowPolicySchema = z.object({
  id: IdSchema,
  type: WorkflowTypeSchema,
  escalationDeadlineHours: z.number().int().positive(),
  escalationRoles: z.array(WorkflowApproverRoleSchema).min(1).max(5),
  maxDelegationDepth: z.number().int().min(1).max(10),
  activeFrom: DateTimeSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type WorkflowPolicy = z.infer<typeof WorkflowPolicySchema>;

export const WorkflowPolicyUpsertSchema = z.object({
  escalationDeadlineHours: z.number().int().positive(),
  escalationRoles: z.array(WorkflowApproverRoleSchema).min(1).max(5),
  maxDelegationDepth: z.number().int().min(1).max(10).default(5),
  activeFrom: DateTimeSchema.optional(),
});
export type WorkflowPolicyUpsert = z.infer<typeof WorkflowPolicyUpsertSchema>;

export const WorkflowDelegationRuleSchema = z.object({
  id: IdSchema,
  delegatorId: IdSchema,
  delegateId: IdSchema,
  workflowType: WorkflowTypeSchema.nullable(),
  organizationUnitId: IdSchema.nullable(),
  activeFrom: DateTimeSchema,
  activeTo: DateTimeSchema.nullable(),
  isActive: z.boolean(),
  priority: z.number().int().nonnegative(),
  createdById: IdSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type WorkflowDelegationRule = z.infer<typeof WorkflowDelegationRuleSchema>;

export const CreateWorkflowDelegationRuleSchema = z
  .object({
    delegatorId: IdSchema,
    delegateId: IdSchema,
    workflowType: WorkflowTypeSchema.optional(),
    organizationUnitId: IdSchema.optional(),
    activeFrom: DateTimeSchema,
    activeTo: DateTimeSchema.optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.delegatorId === value.delegateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'delegator and delegate must differ',
        path: ['delegateId'],
      });
    }

    if (value.activeTo && value.activeTo <= value.activeFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'activeTo must be after activeFrom',
        path: ['activeTo'],
      });
    }
  });
export type CreateWorkflowDelegationRule = z.infer<typeof CreateWorkflowDelegationRuleSchema>;

export const UpdateWorkflowDelegationRuleSchema = z
  .object({
    delegateId: IdSchema.optional(),
    workflowType: WorkflowTypeSchema.optional().nullable(),
    organizationUnitId: IdSchema.optional().nullable(),
    activeFrom: DateTimeSchema.optional(),
    activeTo: DateTimeSchema.optional().nullable(),
    isActive: z.boolean().optional(),
    priority: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.activeFrom && value.activeTo && value.activeTo <= value.activeFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'activeTo must be after activeFrom',
        path: ['activeTo'],
      });
    }
  });
export type UpdateWorkflowDelegationRule = z.infer<typeof UpdateWorkflowDelegationRuleSchema>;

/** Backward-compat alias for legacy call sites */
export const WorkflowDecisionSchema = WorkflowDecisionCommandSchema;
export type WorkflowDecision = WorkflowDecisionCommand;

/** Body-only schema for workflow decision (workflowId comes from URL param) */
export const WorkflowDecisionBodySchema = z
  .object({
    action: WorkflowActionSchema.optional(),
    decision: z.enum(['APPROVED', 'REJECTED']).optional(),
    reason: z.string().max(1000).optional(),
    delegateToId: IdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.action && !value.decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action or decision is required',
        path: ['action'],
      });
    }

    if (value.action && value.decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action and decision cannot be provided together',
        path: ['decision'],
      });
    }

    if (value.action === 'DELEGATE' && !value.delegateToId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'delegateToId is required for DELEGATE action',
        path: ['delegateToId'],
      });
    }
  });
export type WorkflowDecisionBody = z.infer<typeof WorkflowDecisionBodySchema>;

/** Query parameters for listing workflow delegation rules */
export const WorkflowDelegationQuerySchema = z.object({
  delegatorId: IdSchema.optional(),
  workflowType: WorkflowTypeSchema.optional(),
});
export type WorkflowDelegationQuery = z.infer<typeof WorkflowDelegationQuerySchema>;

export const ShiftSwapRequestSchema = z
  .object({
    shiftId: IdSchema,
    fromPersonId: IdSchema,
    toPersonId: IdSchema,
    reason: z.string().min(10).max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.fromPersonId === value.toPersonId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fromPersonId and toPersonId must differ',
        path: ['toPersonId'],
      });
    }
  });
export type ShiftSwapRequest = z.infer<typeof ShiftSwapRequestSchema>;

export const OvertimeApprovalRequestSchema = z.object({
  personId: IdSchema,
  periodStart: DateTimeSchema,
  periodEnd: DateTimeSchema,
  overtimeHours: z.number().positive(),
  reason: z.string().min(10).max(1000),
});
export type OvertimeApprovalRequest = z.infer<typeof OvertimeApprovalRequestSchema>;
