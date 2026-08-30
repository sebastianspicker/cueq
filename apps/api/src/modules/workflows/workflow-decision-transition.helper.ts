/** Runs one workflow decision entirely through explicitly supplied dependencies. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkflowInstance } from '@cueq/database';
import { transitionWorkflow, type WorkflowDecision } from '@cueq/domain';
import type { WorkflowAction, WorkflowDecisionCommand } from '@cueq/contracts';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper.js';
import type { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';
import type { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type { WorkflowActor, WorkflowDecisionResult } from './workflow-contracts.js';
import { appendTrail } from './workflow-persistence-normalization.js';
import { isRoleAllowedForType } from './workflow-routing-policy.js';
import { toIso } from './workflow-time.js';
import { availableWorkflowActions, normalizeWorkflowAction } from './workflow-action-visibility.js';

type WorkflowDecisionDatabase = PrismaService | Prisma.TransactionClient;
type SuccessfulTransition = Extract<ReturnType<typeof transitionWorkflow>, { ok: true }>;

export interface WorkflowDecisionDependencies {
  prisma: PrismaService;
  auditHelper: Pick<AuditHelper, 'appendAudit'>;
  delegationCrud: Pick<WorkflowDelegationCrudHelper, 'validateInlineDelegation'>;
  sideEffectsHelper: Pick<WorkflowSideEffectsHelper, 'validatePostCloseSelfApproval'>;
  lockPersonWrites: typeof lockPersonWrites;
}

export interface WorkflowDecisionTransitionInput {
  actor: WorkflowActor;
  command: WorkflowDecisionCommand;
  tx?: Prisma.TransactionClient;
}

/**
 * Preserves the decision transaction order: fetch, authorization, state transition, routing,
 * compare-and-swap, re-fetch, then audit. The caller supplies a transaction when one exists.
 */
export async function transitionWorkflowDecision(
  dependencies: WorkflowDecisionDependencies,
  { actor, command, tx }: WorkflowDecisionTransitionInput,
): Promise<WorkflowDecisionResult> {
  const db = tx ?? dependencies.prisma;
  const action = normalizeWorkflowAction(command);
  const workflow = await db.workflowInstance.findUnique({ where: { id: command.workflowId } });
  if (!workflow) {
    throw new NotFoundException('Workflow not found.');
  }

  await validateDecision(dependencies, actor, workflow, action, command.reason);
  const transition = createDecisionTransition(actor, workflow, action, command.reason);
  const routing = await resolveDecisionRouting(dependencies, actor, workflow, action, command, tx);
  const updated = await persistDecision(db, workflow, action, command, transition, routing);
  await appendDecisionAudit(dependencies, actor.id, action, workflow, updated, command.reason, db);

  return { action, previous: workflow, updated };
}

async function validateDecision(
  dependencies: WorkflowDecisionDependencies,
  actor: WorkflowActor,
  workflow: WorkflowInstance,
  action: WorkflowAction,
  reason?: string,
): Promise<void> {
  if (!availableWorkflowActions(workflow, actor).includes(action)) {
    throw new ForbiddenException('Action is not allowed for this actor and workflow state.');
  }
  if (action !== 'CANCEL' && !isRoleAllowedForType(actor.role, workflow.type)) {
    throw new ForbiddenException('Role cannot decide this workflow type.');
  }
  if (action === 'APPROVE') {
    await dependencies.sideEffectsHelper.validatePostCloseSelfApproval(actor.id, workflow, reason);
  }
}

function createDecisionTransition(
  actor: WorkflowActor,
  workflow: WorkflowInstance,
  action: WorkflowAction,
  reason?: string,
): SuccessfulTransition {
  const transition = transitionWorkflow({
    workflowId: workflow.id,
    currentStatus: workflow.status,
    decision: action as WorkflowDecision,
    actorId: actor.id,
    reason,
    at: toIso(new Date()),
  });
  if (!transition.ok) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: transition.violations.join('; '),
      details: transition.violations,
    });
  }
  return transition;
}

async function resolveDecisionRouting(
  dependencies: WorkflowDecisionDependencies,
  actor: WorkflowActor,
  workflow: WorkflowInstance,
  action: WorkflowAction,
  command: WorkflowDecisionCommand,
  tx?: Prisma.TransactionClient,
): Promise<{ nextApproverId: string | null; delegationTrail: string[] }> {
  if (action !== 'DELEGATE') {
    return {
      nextApproverId: workflow.approverId,
      delegationTrail: appendTrail(workflow.delegationTrail, workflow.approverId),
    };
  }
  if (!command.delegateToId) {
    throw new BadRequestException('delegateToId is required for DELEGATE.');
  }
  if (tx) {
    await dependencies.lockPersonWrites(tx, [command.delegateToId]);
  }
  await dependencies.delegationCrud.validateInlineDelegation(
    {
      delegateToId: command.delegateToId,
      actorId: actor.id,
      actorRole: actor.role,
      actorOrganizationUnitId: actor.organizationUnitId,
      requesterId: workflow.requesterId,
      workflowType: workflow.type,
    },
    tx,
  );
  return {
    nextApproverId: command.delegateToId,
    delegationTrail: appendTrail(workflow.delegationTrail, command.delegateToId),
  };
}

async function persistDecision(
  db: WorkflowDecisionDatabase,
  workflow: WorkflowInstance,
  action: WorkflowAction,
  command: WorkflowDecisionCommand,
  transition: SuccessfulTransition,
  routing: { nextApproverId: string | null; delegationTrail: string[] },
): Promise<WorkflowInstance> {
  const updatedCount = await db.workflowInstance.updateMany({
    where: {
      id: workflow.id,
      status: workflow.status,
      approverId: workflow.approverId,
      delegationTrail: { equals: workflow.delegationTrail ?? undefined },
    },
    data: {
      status: transition.nextStatus,
      approverId: routing.nextApproverId,
      delegationTrail: routing.delegationTrail,
      decisionReason: command.reason ?? workflow.decisionReason,
      decidedAt: ['APPROVE', 'REJECT', 'CANCEL'].includes(action)
        ? new Date(transition.decidedAt)
        : workflow.decidedAt,
    },
  });
  if (updatedCount.count === 0) {
    throw new ConflictException({
      code: 'WORKFLOW_DECISION_IN_PROGRESS',
      message: 'This workflow changed while the decision was being processed.',
      retryable: true,
    });
  }
  return db.workflowInstance.findUniqueOrThrow({ where: { id: workflow.id } });
}

async function appendDecisionAudit(
  dependencies: WorkflowDecisionDependencies,
  actorId: string,
  action: WorkflowAction,
  workflow: WorkflowInstance,
  updated: WorkflowInstance,
  reason: string | undefined,
  db: WorkflowDecisionDatabase,
): Promise<void> {
  const auditAction =
    action === 'DELEGATE'
      ? 'WORKFLOW_DELEGATED'
      : action === 'CANCEL'
        ? 'WORKFLOW_CANCELLED'
        : 'WORKFLOW_DECIDED';
  await dependencies.auditHelper.appendAudit(
    {
      actorId,
      action: auditAction,
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      before: { status: workflow.status, approverId: workflow.approverId },
      after: { status: updated.status, approverId: updated.approverId },
      reason,
    },
    db,
  );
}
