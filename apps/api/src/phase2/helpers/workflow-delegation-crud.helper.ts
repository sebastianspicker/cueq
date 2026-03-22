import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role, WorkflowType } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service';
import { AuditHelper } from './audit.helper';
import { HR_LIKE_ROLES } from './role-constants';
import { isRoleAllowedForAllWorkflowTypes, isRoleAllowedForType } from './workflow-utils';

@Injectable()
export class WorkflowDelegationCrudHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private async ensureValidDelegationTarget(input: {
    delegatorId: string;
    delegateId: string;
    workflowType: WorkflowType | null;
  }) {
    if (input.delegatorId === input.delegateId) {
      throw new BadRequestException('Delegator and delegate must be different people.');
    }

    const [delegator, delegate] = await Promise.all([
      this.prisma.person.findUnique({
        where: { id: input.delegatorId },
        select: { id: true },
      }),
      this.prisma.person.findUnique({
        where: { id: input.delegateId },
        select: { id: true, role: true },
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
  }

  async validateInlineDelegation(input: {
    delegateToId: string;
    actorId: string;
    actorRole: string;
    actorOrganizationUnitId: string;
    requesterId: string;
    workflowType: WorkflowType;
  }) {
    if (input.delegateToId === input.actorId) {
      throw new BadRequestException('Approver cannot delegate to self.');
    }
    if (input.delegateToId === input.requesterId) {
      throw new BadRequestException('Requester cannot be delegated as approver.');
    }

    const delegate = await this.prisma.person.findUnique({
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

  async createDelegation(
    actorId: string,
    payload: {
      delegatorId: string;
      delegateId: string;
      workflowType?: WorkflowType;
      organizationUnitId?: string;
      activeFrom: string;
      activeTo?: string;
      isActive?: boolean;
      priority?: number;
    },
  ) {
    await this.ensureValidDelegationTarget({
      delegatorId: payload.delegatorId,
      delegateId: payload.delegateId,
      workflowType: payload.workflowType ?? null,
    });

    const created = await this.prisma.workflowDelegationRule.create({
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

    await this.auditHelper.appendAudit({
      actorId,
      action: 'WORKFLOW_DELEGATION_CREATED',
      entityType: 'WorkflowDelegationRule',
      entityId: created.id,
      after: {
        delegatorId: created.delegatorId,
        delegateId: created.delegateId,
        workflowType: created.workflowType,
      },
    });

    return created;
  }

  async updateDelegation(
    actorId: string,
    id: string,
    payload: {
      delegateId?: string;
      workflowType?: WorkflowType | null;
      organizationUnitId?: string | null;
      activeFrom?: string;
      activeTo?: string | null;
      isActive?: boolean;
      priority?: number;
    },
  ) {
    const current = await this.prisma.workflowDelegationRule.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Delegation rule not found.');
    }

    const nextActiveFrom = payload.activeFrom ? new Date(payload.activeFrom) : current.activeFrom;
    const nextActiveTo =
      payload.activeTo === null
        ? null
        : payload.activeTo
          ? new Date(payload.activeTo)
          : current.activeTo;
    if (nextActiveTo && nextActiveTo <= nextActiveFrom) {
      throw new BadRequestException('activeTo must be after activeFrom.');
    }

    const nextDelegateId = payload.delegateId ?? current.delegateId;
    const nextWorkflowType =
      payload.workflowType === undefined ? current.workflowType : payload.workflowType;
    await this.ensureValidDelegationTarget({
      delegatorId: current.delegatorId,
      delegateId: nextDelegateId,
      workflowType: nextWorkflowType ?? null,
    });

    const updated = await this.prisma.workflowDelegationRule.update({
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

    await this.auditHelper.appendAudit({
      actorId,
      action: 'WORKFLOW_DELEGATION_UPDATED',
      entityType: 'WorkflowDelegationRule',
      entityId: updated.id,
      before: {
        delegateId: current.delegateId,
        workflowType: current.workflowType,
        organizationUnitId: current.organizationUnitId,
      },
      after: {
        delegateId: updated.delegateId,
        workflowType: updated.workflowType,
        organizationUnitId: updated.organizationUnitId,
      },
    });

    return updated;
  }

  async deleteDelegation(actorId: string, id: string) {
    const current = await this.prisma.workflowDelegationRule.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Delegation rule not found.');
    }

    await this.prisma.workflowDelegationRule.delete({ where: { id } });
    await this.auditHelper.appendAudit({
      actorId,
      action: 'WORKFLOW_DELEGATION_DELETED',
      entityType: 'WorkflowDelegationRule',
      entityId: id,
      before: {
        delegatorId: current.delegatorId,
        delegateId: current.delegateId,
      },
    });
  }
}
