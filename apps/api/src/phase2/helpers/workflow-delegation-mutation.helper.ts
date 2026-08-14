/** Performs workflow-delegation mutations inside a caller-owned transaction. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma, WorkflowType } from '@cueq/database';
import type { AuditHelper } from './audit.helper.js';
import { lockPersonWrites, lockPolicyWrites } from './transaction-lock.helper.js';
import { WORKFLOW_ROUTING_LOCK_SCOPE } from './workflow-assignment.helper.js';
import { ensureValidDelegationTarget } from './workflow-delegation-validation.helper.js';

type DelegationAudit = Pick<AuditHelper, 'appendAudit'>;

export type CreateDelegationPayload = {
  delegatorId: string;
  delegateId: string;
  workflowType?: WorkflowType;
  organizationUnitId?: string;
  activeFrom: string;
  activeTo?: string;
  isActive?: boolean;
  priority?: number;
};

export type UpdateDelegationPayload = {
  delegateId?: string;
  workflowType?: WorkflowType | null;
  organizationUnitId?: string | null;
  activeFrom?: string;
  activeTo?: string | null;
  isActive?: boolean;
  priority?: number;
};

export async function createWorkflowDelegationInTransaction(
  tx: Prisma.TransactionClient,
  auditHelper: DelegationAudit,
  actorId: string,
  payload: CreateDelegationPayload,
) {
  await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
  await lockPersonWrites(tx, [payload.delegatorId, payload.delegateId]);
  await ensureValidDelegationTarget(
    {
      delegatorId: payload.delegatorId,
      delegateId: payload.delegateId,
      workflowType: payload.workflowType ?? null,
      organizationUnitId: payload.organizationUnitId ?? null,
    },
    tx,
  );

  const created = await tx.workflowDelegationRule.create({
    data: {
      delegatorId: payload.delegatorId,
      delegateId: payload.delegateId,
      workflowType: payload.workflowType ?? null,
      organizationUnitId: payload.organizationUnitId ?? null,
      activeFrom: new Date(payload.activeFrom),
      activeTo: payload.activeTo ? new Date(payload.activeTo) : null,
      isActive: payload.isActive ?? true,
      priority: payload.priority ?? 0,
      createdById: actorId,
    },
  });

  await auditHelper.appendAudit(
    {
      actorId,
      action: 'WORKFLOW_DELEGATION_CREATED',
      entityType: 'WorkflowDelegationRule',
      entityId: created.id,
      after: {
        delegatorId: created.delegatorId,
        delegateId: created.delegateId,
        workflowType: created.workflowType,
      },
    },
    tx,
  );

  return created;
}

export async function updateWorkflowDelegationInTransaction(
  tx: Prisma.TransactionClient,
  auditHelper: DelegationAudit,
  actorId: string,
  id: string,
  payload: UpdateDelegationPayload,
) {
  await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
  const currentAtWrite = await getDelegationForMutation(tx, id);

  const nextDelegateId = payload.delegateId ?? currentAtWrite.delegateId;
  await lockPersonWrites(tx, [currentAtWrite.delegatorId, nextDelegateId]);

  const nextActiveFrom = payload.activeFrom
    ? new Date(payload.activeFrom)
    : currentAtWrite.activeFrom;
  const nextActiveTo =
    payload.activeTo === null
      ? null
      : payload.activeTo
        ? new Date(payload.activeTo)
        : currentAtWrite.activeTo;
  if (nextActiveTo && nextActiveTo <= nextActiveFrom) {
    throw new BadRequestException('activeTo must be after activeFrom.');
  }

  const nextWorkflowType =
    payload.workflowType === undefined ? currentAtWrite.workflowType : payload.workflowType;
  const nextOrganizationUnitId =
    payload.organizationUnitId === undefined
      ? currentAtWrite.organizationUnitId
      : payload.organizationUnitId;
  await ensureValidDelegationTarget(
    {
      delegatorId: currentAtWrite.delegatorId,
      delegateId: nextDelegateId,
      workflowType: nextWorkflowType ?? null,
      organizationUnitId: nextOrganizationUnitId,
    },
    tx,
  );

  const updated = await tx.workflowDelegationRule.update({
    where: { id },
    data: {
      delegateId: payload.delegateId,
      workflowType: payload.workflowType,
      organizationUnitId: payload.organizationUnitId,
      activeFrom: payload.activeFrom ? new Date(payload.activeFrom) : undefined,
      activeTo:
        payload.activeTo === null
          ? null
          : payload.activeTo
            ? new Date(payload.activeTo)
            : undefined,
      isActive: payload.isActive,
      priority: payload.priority,
    },
  });

  await auditHelper.appendAudit(
    {
      actorId,
      action: 'WORKFLOW_DELEGATION_UPDATED',
      entityType: 'WorkflowDelegationRule',
      entityId: updated.id,
      before: {
        delegateId: currentAtWrite.delegateId,
        workflowType: currentAtWrite.workflowType,
        organizationUnitId: currentAtWrite.organizationUnitId,
      },
      after: {
        delegateId: updated.delegateId,
        workflowType: updated.workflowType,
        organizationUnitId: updated.organizationUnitId,
      },
    },
    tx,
  );

  return updated;
}

export async function deleteWorkflowDelegationInTransaction(
  tx: Prisma.TransactionClient,
  auditHelper: DelegationAudit,
  actorId: string,
  id: string,
) {
  await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
  const currentAtWrite = await getDelegationForMutation(tx, id);

  await tx.workflowDelegationRule.delete({ where: { id } });
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'WORKFLOW_DELEGATION_DELETED',
      entityType: 'WorkflowDelegationRule',
      entityId: id,
      before: {
        delegatorId: currentAtWrite.delegatorId,
        delegateId: currentAtWrite.delegateId,
      },
    },
    tx,
  );
}

async function getDelegationForMutation(tx: Prisma.TransactionClient, id: string) {
  const delegation = await tx.workflowDelegationRule.findUnique({ where: { id } });
  if (!delegation) {
    throw new NotFoundException('Delegation rule not found.');
  }

  return delegation;
}
