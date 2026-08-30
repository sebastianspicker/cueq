/** Defines pure workflow action and visibility policy shared by the runtime façade. */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, WorkflowStatus, type WorkflowInstance } from '@cueq/database';
import type { WorkflowAction, WorkflowDecisionCommand } from '@cueq/contracts';
import { HR_LIKE_ROLES } from '../people/public.js';
import type { WorkflowActor } from './workflow-contracts.js';
import { isRoleAllowedForType } from './workflow-routing-policy.js';
import { isWorkflowFinal } from './workflow-state.js';

/** Normalizes legacy decision payloads to the action used by the workflow state machine. */
export function normalizeWorkflowAction(command: WorkflowDecisionCommand): WorkflowAction {
  if (command.action) {
    return command.action;
  }
  if (command.decision === 'APPROVED') {
    return 'APPROVE';
  }
  if (command.decision === 'REJECTED') {
    return 'REJECT';
  }
  throw new BadRequestException('action or decision is required.');
}

/** Returns the actions an actor may take without mutating workflow state. */
export function availableWorkflowActions(
  workflow: WorkflowInstance,
  actor: WorkflowActor,
): WorkflowAction[] {
  if (isWorkflowFinal(workflow.status)) {
    return [];
  }

  const actions = new Set<WorkflowAction>();
  const isRequester = workflow.requesterId === actor.id;
  const mayApprove =
    workflow.approverId === actor.id && isRoleAllowedForType(actor.role, workflow.type);
  const isPending =
    workflow.status === WorkflowStatus.PENDING || workflow.status === WorkflowStatus.ESCALATED;

  if (isRequester) {
    if (workflow.status === WorkflowStatus.DRAFT || workflow.status === WorkflowStatus.SUBMITTED) {
      actions.add('SUBMIT');
    }
    actions.add('CANCEL');
  }
  if (mayApprove && isPending) {
    actions.add('APPROVE');
    actions.add('REJECT');
    actions.add('DELEGATE');
  }

  return [...actions];
}

/** Determines whether private workflow reasons may be exposed to an actor. */
export function mayViewWorkflowReason(workflow: WorkflowInstance, actor: WorkflowActor): boolean {
  return (
    workflow.requesterId === actor.id ||
    workflow.approverId === actor.id ||
    actor.role === Role.TEAM_LEAD ||
    actor.role === Role.HR ||
    actor.role === Role.ADMIN
  );
}

/** Enforces the workflow visibility boundary used by detail views. */
export function ensureMayAccessWorkflow(workflow: WorkflowInstance, actor: WorkflowActor): void {
  if (
    workflow.requesterId !== actor.id &&
    workflow.approverId !== actor.id &&
    !HR_LIKE_ROLES.has(actor.role)
  ) {
    throw new ForbiddenException('Workflow is not visible to this actor.');
  }
}

/** Computes an overdue flag from an explicit clock. */
export function isWorkflowOverdue(workflow: WorkflowInstance, now: Date): boolean {
  return Boolean(
    workflow.dueAt &&
    (workflow.status === WorkflowStatus.PENDING || workflow.status === WorkflowStatus.ESCALATED) &&
    workflow.dueAt.getTime() <= now.getTime(),
  );
}
