/** Narrow owner-module capabilities invoked after a workflow state transition. */
import type { Prisma, WorkflowType } from '@cueq/database';
import type { WorkflowAction } from '@cueq/contracts';

export const ABSENCE_WORKFLOW_EFFECTS_PORT = Symbol('ABSENCE_WORKFLOW_EFFECTS_PORT');
export const ATTENDANCE_WORKFLOW_EFFECTS_PORT = Symbol('ATTENDANCE_WORKFLOW_EFFECTS_PORT');
export const SCHEDULING_WORKFLOW_EFFECTS_PORT = Symbol('SCHEDULING_WORKFLOW_EFFECTS_PORT');

interface WorkflowEffectDecision {
  id: string;
  type: WorkflowType;
  entityType: string;
  entityId: string;
  requestPayload: Prisma.JsonValue;
}

export interface WorkflowEffectInput {
  actorId: string;
  action: WorkflowAction;
  decision: WorkflowEffectDecision;
  reason?: string;
  tx: Prisma.TransactionClient;
}

export interface WorkflowPreApprovalInput {
  decision: WorkflowEffectDecision;
  tx: Prisma.TransactionClient;
}

export interface AbsenceWorkflowEffectsPort {
  applyWorkflowEffect(input: WorkflowEffectInput): Promise<void>;
}

export interface AttendanceWorkflowEffectsPort {
  validateWorkflowPreApproval(input: WorkflowPreApprovalInput): Promise<void>;
  applyWorkflowEffect(input: WorkflowEffectInput): Promise<void>;
}

export interface SchedulingWorkflowEffectsPort {
  validateWorkflowPreApproval(input: WorkflowPreApprovalInput): Promise<void>;
  applyWorkflowEffect(input: WorkflowEffectInput): Promise<void>;
}
