/** Owns persisted workflow-policy resolution and versioning behind the routing lock. */
import { BadRequestException } from '@nestjs/common';
import type { Prisma, WorkflowPolicy } from '@cueq/database';
import type { WorkflowType } from '@cueq/database';
import type { WorkflowPolicyUpsert } from '@cueq/shared';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import { lockPolicyWrites } from './transaction-lock.helper.js';
import { DEFAULT_POLICIES, isRoleAllowedForType } from './workflow-utils.js';

/** Shared advisory-lock scope that serializes workflow routing and policy changes. */
export const WORKFLOW_ROUTING_LOCK_SCOPE = 'workflow-routing';

type PolicyStore = Pick<PrismaService, 'workflowPolicy'>;
type PolicyAudit = Pick<AuditHelper, 'appendAudit'>;

export async function ensureWorkflowPolicyInTransaction(
  tx: Prisma.TransactionClient,
  type: WorkflowType,
): Promise<WorkflowPolicy> {
  const existing = await tx.workflowPolicy.findFirst({
    where: { type, activeTo: null },
    orderBy: { activeFrom: 'desc' },
  });
  if (existing) {
    return existing;
  }

  const defaultPolicy = DEFAULT_POLICIES[type];
  return tx.workflowPolicy.create({
    data: {
      type,
      escalationDeadlineHours: defaultPolicy.escalationDeadlineHours,
      escalationRoles: defaultPolicy.escalationRoles,
      maxDelegationDepth: defaultPolicy.maxDelegationDepth,
      activeFrom: new Date(),
    },
  });
}

export async function ensureWorkflowPolicy(
  prisma: Pick<PrismaService, '$transaction'>,
  type: WorkflowType,
  tx?: Prisma.TransactionClient,
): Promise<WorkflowPolicy> {
  if (tx) {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
    return ensureWorkflowPolicyInTransaction(tx, type);
  }

  return prisma.$transaction(async (transaction) => {
    await lockPolicyWrites(transaction, WORKFLOW_ROUTING_LOCK_SCOPE);
    return ensureWorkflowPolicyInTransaction(transaction, type);
  });
}

export function getActiveWorkflowPolicy(prisma: PolicyStore, type: WorkflowType) {
  return prisma.workflowPolicy.findFirst({
    where: { type, activeTo: null },
    orderBy: { activeFrom: 'desc' },
  });
}

export function listActiveWorkflowPolicies(prisma: PolicyStore) {
  return prisma.workflowPolicy.findMany({
    where: { activeTo: null },
    orderBy: { type: 'asc' },
  });
}

export async function listWorkflowPolicyHistory(prisma: PolicyStore, type: WorkflowType) {
  const entries = await prisma.workflowPolicy.findMany({
    where: { type },
    orderBy: { activeFrom: 'desc' },
  });
  return { entries, total: entries.length };
}

export async function upsertWorkflowPolicy(
  prisma: Pick<PrismaService, '$transaction'>,
  auditHelper: PolicyAudit,
  type: WorkflowType,
  payload: WorkflowPolicyUpsert,
  actorId?: string,
) {
  const invalidRole = payload.escalationRoles.find((role) => !isRoleAllowedForType(role, type));
  if (invalidRole) {
    throw new BadRequestException(
      `Escalation role ${invalidRole} cannot be used for workflow type ${type}.`,
    );
  }

  const activeFrom = payload.activeFrom ? new Date(payload.activeFrom) : new Date();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);

    const previous = await tx.workflowPolicy.findMany({
      where: { type, activeTo: null },
      orderBy: { activeFrom: 'desc' },
    });

    await tx.workflowPolicy.updateMany({
      where: { type, activeTo: null },
      data: { activeTo: now },
    });

    const created = await tx.workflowPolicy.create({
      data: {
        type,
        escalationDeadlineHours: payload.escalationDeadlineHours,
        escalationRoles: payload.escalationRoles,
        maxDelegationDepth: payload.maxDelegationDepth,
        activeFrom,
      },
    });

    if (actorId) {
      await auditHelper.appendAudit(
        {
          actorId,
          action: 'WORKFLOW_POLICY_UPDATED',
          entityType: 'WorkflowPolicy',
          entityId: created.id,
          before: previous.map((entry) => ({
            id: entry.id,
            escalationDeadlineHours: entry.escalationDeadlineHours,
            escalationRoles: entry.escalationRoles,
            maxDelegationDepth: entry.maxDelegationDepth,
            activeFrom: entry.activeFrom.toISOString(),
          })),
          after: {
            id: created.id,
            type: created.type,
            escalationDeadlineHours: created.escalationDeadlineHours,
            escalationRoles: created.escalationRoles,
            maxDelegationDepth: created.maxDelegationDepth,
            activeFrom: created.activeFrom.toISOString(),
          },
        },
        tx,
      );
    }

    return created;
  });
}
