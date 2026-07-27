/** Validates and persists scope-safe workflow delegation records. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, Role, type WorkflowType } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { HR_LIKE_ROLES } from './role-constants.js';
import { isRoleAllowedForAllWorkflowTypes, isRoleAllowedForType } from './workflow-utils.js';
import { lockPersonWrites, lockPolicyWrites } from './transaction-lock.helper.js';
import { WORKFLOW_ROUTING_LOCK_SCOPE } from './workflow-assignment.helper.js';

type CreateDelegationPayload = {
  delegatorId: string;
  delegateId: string;
  workflowType?: WorkflowType;
  organizationUnitId?: string;
  activeFrom: string;
  activeTo?: string;
  isActive?: boolean;
  priority?: number;
};

type UpdateDelegationPayload = {
  delegateId?: string;
  workflowType?: WorkflowType | null;
  organizationUnitId?: string | null;
  activeFrom?: string;
  activeTo?: string | null;
  isActive?: boolean;
  priority?: number;
};

/**
 * Validates and persists workflow delegations without allowing role, scope, or routing-policy bypasses.
 */
@Injectable()
export class WorkflowDelegationCrudHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private async ensureValidDelegationTarget(
    input: {
      delegatorId: string;
      delegateId: string;
      workflowType: WorkflowType | null;
      organizationUnitId?: string | null;
    },
    db: Pick<PrismaService, 'person'> = this.prisma,
  ) {
    if (input.delegatorId === input.delegateId) {
      throw new BadRequestException('Delegator and delegate must be different people.');
    }

    const [delegator, delegate] = await Promise.all([
      db.person.findUnique({
        where: { id: input.delegatorId },
        select: { id: true, organizationUnitId: true },
      }),
      db.person.findUnique({
        where: { id: input.delegateId },
        select: { id: true, role: true, organizationUnitId: true },
      }),
    ]);

    if (!delegator) {
      throw new BadRequestException('delegatorId person was not found.');
    }
    if (!delegate) {
      throw new BadRequestException('delegateId person was not found.');
    }

    const delegateRoleAllowed = input.workflowType
      ? isRoleAllowedForType(delegate.role, input.workflowType)
      : isRoleAllowedForAllWorkflowTypes(delegate.role);
    if (!delegateRoleAllowed) {
      if (input.workflowType) {
        throw new BadRequestException(
          `delegateId role cannot approve workflow type ${input.workflowType}.`,
        );
      }

      throw new BadRequestException(
        'delegateId role cannot be used for delegations without a specific workflowType.',
      );
    }

    const delegatedOrganizationUnitId = input.organizationUnitId ?? delegator.organizationUnitId;
    if (
      delegatedOrganizationUnitId &&
      delegate.organizationUnitId !== delegatedOrganizationUnitId &&
      !HR_LIKE_ROLES.has(delegate.role)
    ) {
      throw new BadRequestException(
        'Non-HR/Admin delegates must belong to the delegated organization unit.',
      );
    }
  }

  async validateInlineDelegation(
    input: {
      delegateToId: string;
      actorId: string;
      actorRole: string;
      actorOrganizationUnitId: string;
      requesterId: string;
      workflowType: WorkflowType;
    },
    db: Pick<PrismaService, 'person'> = this.prisma,
  ) {
    if (input.delegateToId === input.actorId) {
      throw new BadRequestException('Approver cannot delegate to self.');
    }
    if (input.delegateToId === input.requesterId) {
      throw new BadRequestException('Requester cannot be delegated as approver.');
    }

    const delegate = await db.person.findUnique({
      where: { id: input.delegateToId },
      select: { id: true, role: true, organizationUnitId: true },
    });
    if (!delegate) {
      throw new BadRequestException('delegateToId person was not found.');
    }
    if (!isRoleAllowedForType(delegate.role, input.workflowType)) {
      throw new BadRequestException(
        `delegateToId role cannot approve workflow type ${input.workflowType}.`,
      );
    }
    if (
      (input.actorRole === Role.TEAM_LEAD || input.actorRole === Role.SHIFT_PLANNER) &&
      delegate.organizationUnitId !== input.actorOrganizationUnitId &&
      !HR_LIKE_ROLES.has(delegate.role)
    ) {
      throw new BadRequestException(
        'Team leads and shift planners can only delegate within their own organization unit or to HR/Admin.',
      );
    }
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return this.prisma.workflowDelegationRule.findMany({
      where: {
        delegatorId: query.delegatorId,
        workflowType: query.workflowType,
      },
      orderBy: [{ delegatorId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createDelegation(actorId: string, payload: CreateDelegationPayload) {
    return this.prisma.$transaction((tx) =>
      this.createDelegationInTransaction(tx, actorId, payload),
    );
  }

  private async createDelegationInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    payload: CreateDelegationPayload,
  ) {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
    await lockPersonWrites(tx, [payload.delegatorId, payload.delegateId]);
    await this.ensureValidDelegationTarget(
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

    await this.auditHelper.appendAudit(
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

  async updateDelegation(actorId: string, id: string, payload: UpdateDelegationPayload) {
    return this.prisma.$transaction((tx) =>
      this.updateDelegationInTransaction(tx, actorId, id, payload),
    );
  }

  private async updateDelegationInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    payload: UpdateDelegationPayload,
  ) {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
    const currentAtWrite = await this.getDelegationForMutation(tx, id);

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
    await this.ensureValidDelegationTarget(
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

    await this.auditHelper.appendAudit(
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

  async deleteDelegation(actorId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
      const currentAtWrite = await this.getDelegationForMutation(tx, id);

      await tx.workflowDelegationRule.delete({ where: { id } });
      await this.auditHelper.appendAudit(
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
    });
  }

  private async getDelegationForMutation(tx: Prisma.TransactionClient, id: string) {
    const delegation = await tx.workflowDelegationRule.findUnique({ where: { id } });
    if (!delegation) {
      throw new NotFoundException('Delegation rule not found.');
    }

    return delegation;
  }
}
