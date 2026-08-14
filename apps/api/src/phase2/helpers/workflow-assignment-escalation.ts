/** Escalates overdue workflows with fresh-state checks, compare-and-swap, and transaction-coupled audit. */
import type { Prisma, WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus } from '@cueq/database';
import { shouldEscalate, transitionWorkflow } from '@cueq/core';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import {
  ensureWorkflowPolicyInTransaction,
  WORKFLOW_ROUTING_LOCK_SCOPE,
} from './workflow-assignment-policy.js';
import { firstPersonByRoles } from './workflow-assignment-routing.js';
import { lockPolicyWrites } from './transaction-lock.helper.js';
import { appendTrail, asRoleArray, toIso } from './workflow-utils.js';

type EscalationPrisma = Pick<PrismaService, '$transaction' | 'workflowInstance'>;
type EscalationAudit = Pick<AuditHelper, 'appendAudit'>;

function isFreshPendingCandidate(
  workflow: WorkflowInstance | null,
  candidate: Pick<WorkflowInstance, 'escalationLevel'>,
  now: Date,
): workflow is WorkflowInstance {
  return Boolean(
    workflow &&
    workflow.status === WorkflowStatus.PENDING &&
    workflow.escalationLevel === candidate.escalationLevel &&
    workflow.dueAt &&
    workflow.dueAt <= now,
  );
}

function shouldEscalateWorkflow(workflow: WorkflowInstance, now: Date): boolean {
  return shouldEscalate({
    currentStatus: workflow.status,
    submittedAt: toIso(workflow.submittedAt ?? workflow.createdAt),
    now: toIso(now),
    escalationDeadlineHours: 0,
  });
}

function escalationTransition(workflow: WorkflowInstance, now: Date) {
  return transitionWorkflow({
    workflowId: workflow.id,
    currentStatus: workflow.status,
    decision: 'ESCALATE',
    actorId: 'system:workflow-escalation',
    at: toIso(now),
  });
}

function escalationTargetRole(policy: WorkflowPolicy, escalationLevel: number): Role {
  const roles = asRoleArray(policy.escalationRoles);
  return roles[Math.min(escalationLevel, Math.max(0, roles.length - 1))] ?? Role.HR;
}

async function resolveEscalationApprover(
  tx: Prisma.TransactionClient,
  workflow: WorkflowInstance,
  policy: WorkflowPolicy,
): Promise<string | null> {
  const requester = await tx.person.findUnique({
    where: { id: workflow.requesterId },
    select: { organizationUnitId: true },
  });
  const fallbackApprover = await firstPersonByRoles(
    [escalationTargetRole(policy, workflow.escalationLevel)],
    requester?.organizationUnitId,
    workflow.requesterId,
    tx,
  );
  return fallbackApprover ?? workflow.approverId;
}

async function updateEscalatedWorkflow(
  tx: Prisma.TransactionClient,
  workflow: WorkflowInstance,
  now: Date,
  nextStatus: WorkflowStatus,
  nextApproverId: string | null,
): Promise<boolean> {
  const delegationTrail = appendTrail(workflow.delegationTrail, nextApproverId);
  const result = await tx.workflowInstance.updateMany({
    where: {
      id: workflow.id,
      status: WorkflowStatus.PENDING,
      escalationLevel: workflow.escalationLevel,
      approverId: workflow.approverId,
      delegationTrail: { equals: workflow.delegationTrail ?? undefined },
      dueAt: { equals: workflow.dueAt, lte: now },
    },
    data: {
      status: nextStatus,
      approverId: nextApproverId,
      escalatedAt: now,
      escalationLevel: workflow.escalationLevel + 1,
      delegationTrail,
    },
  });
  return result.count > 0;
}

async function appendEscalationAudit(
  auditHelper: EscalationAudit,
  tx: Prisma.TransactionClient,
  workflow: WorkflowInstance,
  nextStatus: WorkflowStatus,
  nextApproverId: string | null,
): Promise<void> {
  await auditHelper.appendAudit(
    {
      actorId: 'system:workflow-escalation',
      action: 'WORKFLOW_ESCALATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      before: {
        status: workflow.status,
        approverId: workflow.approverId,
        escalationLevel: workflow.escalationLevel,
      },
      after: {
        status: nextStatus,
        approverId: nextApproverId,
        escalationLevel: workflow.escalationLevel + 1,
      },
      reason: 'automatic escalation',
    },
    tx,
  );
}

async function escalatePendingCandidate(
  prisma: EscalationPrisma,
  auditHelper: EscalationAudit,
  candidate: WorkflowInstance,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
    const workflow = await tx.workflowInstance.findUnique({ where: { id: candidate.id } });
    if (
      !isFreshPendingCandidate(workflow, candidate, now) ||
      !shouldEscalateWorkflow(workflow, now)
    ) {
      return false;
    }

    const transition = escalationTransition(workflow, now);
    if (!transition.ok) {
      return false;
    }

    const policy = await ensureWorkflowPolicyInTransaction(tx, workflow.type);
    const nextApproverId = await resolveEscalationApprover(tx, workflow, policy);
    const updated = await updateEscalatedWorkflow(
      tx,
      workflow,
      now,
      transition.nextStatus,
      nextApproverId,
    );
    if (!updated) {
      return false;
    }

    await appendEscalationAudit(auditHelper, tx, workflow, transition.nextStatus, nextApproverId);
    return true;
  });
}

export async function escalateOverdueWorkflows(
  prisma: EscalationPrisma,
  auditHelper: EscalationAudit,
  now = new Date(),
) {
  const pending = await prisma.workflowInstance.findMany({
    where: {
      status: WorkflowStatus.PENDING,
      dueAt: { not: null, lte: now },
    },
    orderBy: { dueAt: 'asc' },
  });

  let escalated = 0;
  for (const candidate of pending) {
    if (await escalatePendingCandidate(prisma, auditHelper, candidate, now)) {
      escalated += 1;
    }
  }

  return { escalated };
}
