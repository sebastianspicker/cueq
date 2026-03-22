import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import {
  resolveDelegation,
  shouldEscalate,
  transitionWorkflow,
  type WorkflowDecision,
} from '@cueq/core';
import type {
  WorkflowAction,
  WorkflowDecisionCommand,
  WorkflowInboxQuery,
  WorkflowPolicyUpsert,
} from '@cueq/shared';
import { PrismaService } from '../persistence/prisma.service';
import { AuditHelper } from './helpers/audit.helper';
import { HR_LIKE_ROLES } from './helpers/role-constants';

const TYPE_ROLE_MATRIX: Record<WorkflowType, Role[]> = {
  [WorkflowType.LEAVE_REQUEST]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.BOOKING_CORRECTION]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.POST_CLOSE_CORRECTION]: [Role.HR, Role.ADMIN],
  [WorkflowType.SHIFT_SWAP]: [Role.SHIFT_PLANNER, Role.HR, Role.ADMIN],
  [WorkflowType.OVERTIME_APPROVAL]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
};

const DEFAULT_POLICIES: Record<
  WorkflowType,
  {
    escalationDeadlineHours: number;
    escalationRoles: Role[];
    maxDelegationDepth: number;
  }
> = {
  [WorkflowType.LEAVE_REQUEST]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.BOOKING_CORRECTION]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.POST_CLOSE_CORRECTION]: {
    escalationDeadlineHours: 24,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.SHIFT_SWAP]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.OVERTIME_APPROVAL]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
};

function toIso(date: Date): string {
  return date.toISOString();
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

function asRoleArray(value: Prisma.JsonValue | null | undefined): Role[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is Role => {
    return typeof candidate === 'string' && Object.values(Role).includes(candidate as Role);
  });
}

function appendTrail(trail: Prisma.JsonValue | null, approverId?: string | null): string[] {
  const normalized = Array.isArray(trail)
    ? trail.filter((value): value is string => typeof value === 'string')
    : [];
  if (approverId && !normalized.includes(approverId)) {
    normalized.push(approverId);
  }
  return normalized;
}

function isWorkflowFinal(status: WorkflowStatus): boolean {
  return (
    status === WorkflowStatus.APPROVED ||
    status === WorkflowStatus.REJECTED ||
    status === WorkflowStatus.CANCELLED
  );
}

export interface WorkflowActor {
  id: string;
  role: Role;
  organizationUnitId: string;
}

export interface WorkflowAssignmentInput {
  type: WorkflowType;
  requesterId: string;
  requesterOrganizationUnitId: string;
  preferredApproverId?: string;
  requestedAt?: Date;
}

export interface WorkflowAssignmentResult {
  status: WorkflowStatus;
  approverId: string | null;
  submittedAt: Date;
  dueAt: Date | null;
  escalationLevel: number;
  delegationTrail: string[];
  traversedApprovers: string[];
  escalated: boolean;
  policy: WorkflowPolicy;
}

export interface WorkflowDecisionResult {
  action: WorkflowAction;
  previous: WorkflowInstance;
  updated: WorkflowInstance;
}

@Injectable()
export class WorkflowRuntimeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private isRoleAllowedForType(role: Role, type: WorkflowType): boolean {
    return TYPE_ROLE_MATRIX[type].includes(role);
  }

  private isRoleAllowedForAllWorkflowTypes(role: Role): boolean {
    return (Object.values(WorkflowType) as WorkflowType[]).every((type) =>
      this.isRoleAllowedForType(role, type),
    );
  }

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
      ? this.isRoleAllowedForType(delegate.role, input.workflowType)
      : this.isRoleAllowedForAllWorkflowTypes(delegate.role);
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

  private async ensurePolicy(type: WorkflowType): Promise<WorkflowPolicy> {
    const defaultPolicy = DEFAULT_POLICIES[type];
    return this.prisma.workflowPolicy.upsert({
      where: { type },
      create: {
        type,
        escalationDeadlineHours: defaultPolicy.escalationDeadlineHours,
        escalationRoles: defaultPolicy.escalationRoles,
        maxDelegationDepth: defaultPolicy.maxDelegationDepth,
        activeFrom: new Date(),
      },
      update: {},
    });
  }

  private async firstPersonByRoles(
    roles: Role[],
    organizationUnitId?: string,
    excludeId?: string,
  ): Promise<string | null> {
    const where: Prisma.PersonWhereInput = {
      role: { in: roles },
      id: excludeId ? { not: excludeId } : undefined,
      organizationUnitId,
    };
    const person =
      (await this.prisma.person.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })) ??
      (organizationUnitId
        ? await this.prisma.person.findFirst({
            where: {
              role: { in: roles },
              id: excludeId ? { not: excludeId } : undefined,
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })
        : null);

    return person?.id ?? null;
  }

  private async resolveBaseApprover(input: WorkflowAssignmentInput): Promise<string | null> {
    if (input.preferredApproverId) {
      return input.preferredApproverId;
    }

    if (input.type === WorkflowType.SHIFT_SWAP) {
      const planner = await this.firstPersonByRoles(
        [Role.SHIFT_PLANNER],
        input.requesterOrganizationUnitId,
        input.requesterId,
      );
      if (planner) {
        return planner;
      }

      return this.firstPersonByRoles(
        [Role.HR, Role.ADMIN],
        input.requesterOrganizationUnitId,
        input.requesterId,
      );
    }

    if (input.type === WorkflowType.POST_CLOSE_CORRECTION) {
      const alternate = await this.firstPersonByRoles(
        [Role.HR, Role.ADMIN],
        undefined,
        input.requesterId,
      );
      return alternate ?? input.requesterId;
    }

    const teamLead = await this.firstPersonByRoles(
      [Role.TEAM_LEAD],
      input.requesterOrganizationUnitId,
      input.requesterId,
    );
    if (teamLead) {
      return teamLead;
    }

    return this.firstPersonByRoles([Role.HR, Role.ADMIN], input.requesterOrganizationUnitId);
  }

  private async delegationCandidates(input: {
    primaryApproverId: string;
    workflowType: WorkflowType;
    organizationUnitId: string;
    at: Date;
    maxDepth: number;
  }) {
    const candidates: Array<{
      approverId: string;
      isAvailable: boolean;
      activeFrom?: string;
      activeTo?: string;
    }> = [];
    const visited = new Set<string>([input.primaryApproverId]);
    let currentDelegator = input.primaryApproverId;

    for (let depth = 0; depth < input.maxDepth; depth += 1) {
      const rules = await this.prisma.workflowDelegationRule.findMany({
        where: {
          delegatorId: currentDelegator,
          isActive: true,
          OR: [{ workflowType: null }, { workflowType: input.workflowType }],
          AND: [
            {
              OR: [{ organizationUnitId: null }, { organizationUnitId: input.organizationUnitId }],
            },
            {
              activeFrom: { lte: input.at },
            },
            {
              OR: [{ activeTo: null }, { activeTo: { gte: input.at } }],
            },
          ],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });

      if (rules.length === 0) {
        break;
      }

      const delegateIds = [...new Set(rules.map((rule) => rule.delegateId))];
      const delegates = await this.prisma.person.findMany({
        where: { id: { in: delegateIds } },
        select: { id: true, role: true },
      });
      const delegateById = new Map(delegates.map((delegate) => [delegate.id, delegate]));

      const selectedRule = rules.find((rule) => {
        const delegate = delegateById.get(rule.delegateId);
        if (!delegate) {
          return false;
        }

        return this.isRoleAllowedForType(delegate.role, input.workflowType);
      });
      if (!selectedRule) {
        break;
      }

      candidates.push({
        approverId: selectedRule.delegateId,
        isAvailable: true,
        activeFrom: toIso(selectedRule.activeFrom),
        activeTo: selectedRule.activeTo ? toIso(selectedRule.activeTo) : undefined,
      });

      if (visited.has(selectedRule.delegateId)) {
        break;
      }

      visited.add(selectedRule.delegateId);
      currentDelegator = selectedRule.delegateId;
    }

    return candidates;
  }

  async buildWorkflowAssignment(input: WorkflowAssignmentInput): Promise<WorkflowAssignmentResult> {
    const policy = await this.ensurePolicy(input.type);
    const requestedAt = input.requestedAt ?? new Date();
    const approver = await this.resolveBaseApprover(input);
    const submittedAt = new Date(requestedAt);
    const dueAt = addHours(submittedAt, policy.escalationDeadlineHours);

    const toSubmitted = transitionWorkflow({
      workflowId: 'new',
      currentStatus: 'DRAFT',
      decision: 'SUBMIT',
      actorId: input.requesterId,
      at: toIso(requestedAt),
    });
    const toPending = transitionWorkflow({
      workflowId: 'new',
      currentStatus: toSubmitted.nextStatus,
      decision: 'SUBMIT',
      actorId: input.requesterId,
      at: toIso(requestedAt),
    });
    if (!toSubmitted.ok || !toPending.ok) {
      throw new BadRequestException('Failed to compute initial workflow transitions.');
    }

    if (!approver) {
      return {
        status: WorkflowStatus.PENDING,
        approverId: null,
        submittedAt,
        dueAt,
        escalationLevel: 0,
        delegationTrail: [],
        traversedApprovers: [],
        escalated: false,
        policy,
      };
    }

    const candidates = await this.delegationCandidates({
      primaryApproverId: approver,
      workflowType: input.type,
      organizationUnitId: input.requesterOrganizationUnitId,
      at: requestedAt,
      maxDepth: Math.max(1, policy.maxDelegationDepth),
    });
    const delegated = resolveDelegation({
      requesterId: input.requesterId,
      primaryApproverId: approver,
      fallbackChain: candidates,
      at: toIso(requestedAt),
      maxDepth: policy.maxDelegationDepth,
    });

    return {
      status: WorkflowStatus.PENDING,
      approverId: delegated.approverId,
      submittedAt,
      dueAt,
      escalationLevel: 0,
      delegationTrail: appendTrail(null, delegated.approverId),
      traversedApprovers: delegated.traversed,
      escalated: delegated.escalated,
      policy,
    };
  }

  normalizeAction(command: WorkflowDecisionCommand): WorkflowAction {
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

  availableActions(workflow: WorkflowInstance, actor: WorkflowActor): WorkflowAction[] {
    if (isWorkflowFinal(workflow.status)) {
      return [];
    }

    const actions = new Set<WorkflowAction>();

    if (workflow.requesterId === actor.id) {
      if (
        workflow.status === WorkflowStatus.DRAFT ||
        workflow.status === WorkflowStatus.SUBMITTED
      ) {
        actions.add('SUBMIT');
      }
      actions.add('CANCEL');
    }

    if (
      workflow.approverId === actor.id &&
      this.isRoleAllowedForType(actor.role, workflow.type) &&
      (workflow.status === WorkflowStatus.PENDING || workflow.status === WorkflowStatus.ESCALATED)
    ) {
      actions.add('APPROVE');
      actions.add('REJECT');
      actions.add('DELEGATE');
    }

    return [...actions];
  }

  private canViewReason(workflow: WorkflowInstance, actor: WorkflowActor): boolean {
    if (workflow.requesterId === actor.id || workflow.approverId === actor.id) {
      return true;
    }
    return actor.role === Role.TEAM_LEAD || actor.role === Role.HR || actor.role === Role.ADMIN;
  }

  private ensureMayAccessWorkflow(workflow: WorkflowInstance, actor: WorkflowActor) {
    if (
      workflow.requesterId !== actor.id &&
      workflow.approverId !== actor.id &&
      !HR_LIKE_ROLES.has(actor.role)
    ) {
      throw new ForbiddenException('Workflow is not visible to this actor.');
    }
  }

  private isOverdue(workflow: WorkflowInstance, now: Date): boolean {
    if (!workflow.dueAt) {
      return false;
    }
    if (
      workflow.status !== WorkflowStatus.PENDING &&
      workflow.status !== WorkflowStatus.ESCALATED
    ) {
      return false;
    }
    return workflow.dueAt.getTime() <= now.getTime();
  }

  private withVisibility(
    workflow: WorkflowInstance,
    actor: WorkflowActor,
    now: Date,
  ): WorkflowInstance & {
    isOverdue: boolean;
    availableActions: WorkflowAction[];
  } {
    const canSeeReason = this.canViewReason(workflow, actor);
    return {
      ...workflow,
      reason: canSeeReason ? workflow.reason : null,
      decisionReason: canSeeReason ? workflow.decisionReason : null,
      isOverdue: this.isOverdue(workflow, now),
      availableActions: this.availableActions(workflow, actor),
    };
  }

  async listInbox(actor: WorkflowActor, query: WorkflowInboxQuery) {
    const now = new Date();
    const workflows = await this.prisma.workflowInstance.findMany({
      where: {
        status: query.status,
        type: query.type,
        OR: [{ requesterId: actor.id }, { approverId: actor.id }],
      },
      orderBy: { createdAt: 'asc' },
    });

    const visible = workflows.map((workflow) => this.withVisibility(workflow, actor, now));
    if (query.overdueOnly) {
      return visible.filter((workflow) => workflow.isOverdue);
    }
    return visible;
  }

  async getDetail(actor: WorkflowActor, workflowId: string) {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    this.ensureMayAccessWorkflow(workflow, actor);
    return this.withVisibility(workflow, actor, new Date());
  }

  async decide(
    actor: WorkflowActor,
    command: WorkflowDecisionCommand,
  ): Promise<WorkflowDecisionResult> {
    const action = this.normalizeAction(command);
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: command.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const availableActions = this.availableActions(workflow, actor);
    if (!availableActions.includes(action)) {
      throw new ForbiddenException('Action is not allowed for this actor and workflow state.');
    }

    if (action !== 'CANCEL' && !this.isRoleAllowedForType(actor.role, workflow.type)) {
      throw new ForbiddenException('Role cannot decide this workflow type.');
    }

    if (action === 'APPROVE' && workflow.type === WorkflowType.POST_CLOSE_CORRECTION) {
      if (workflow.requesterId === actor.id) {
        const alternateApprover = await this.prisma.person.findFirst({
          where: {
            role: { in: [Role.HR, Role.ADMIN] },
            id: { not: actor.id },
          },
          select: { id: true },
        });
        if (alternateApprover) {
          throw new ForbiddenException(
            'Post-close correction cannot be self-approved while another HR/Admin exists.',
          );
        }
        if (!command.reason?.includes('[self-approval]')) {
          throw new BadRequestException(
            'Self-approval requires explicit reason flag: include "[self-approval]" in reason.',
          );
        }
      }
    }

    const transition = transitionWorkflow({
      workflowId: workflow.id,
      currentStatus: workflow.status,
      decision: action as WorkflowDecision,
      actorId: actor.id,
      reason: command.reason,
      at: toIso(new Date()),
    });
    if (!transition.ok) {
      throw new BadRequestException(transition.violations);
    }

    let nextApproverId = workflow.approverId;
    let delegationTrail = appendTrail(workflow.delegationTrail, workflow.approverId);
    if (action === 'DELEGATE') {
      if (!command.delegateToId) {
        throw new BadRequestException('delegateToId is required for DELEGATE.');
      }
      if (command.delegateToId === actor.id) {
        throw new BadRequestException('Approver cannot delegate to self.');
      }
      if (command.delegateToId === workflow.requesterId) {
        throw new BadRequestException('Requester cannot be delegated as approver.');
      }

      const delegate = await this.prisma.person.findUnique({
        where: { id: command.delegateToId },
        select: {
          id: true,
          role: true,
          organizationUnitId: true,
        },
      });
      if (!delegate) {
        throw new BadRequestException('delegateToId person was not found.');
      }
      if (!this.isRoleAllowedForType(delegate.role, workflow.type)) {
        throw new BadRequestException(
          `delegateToId role cannot approve workflow type ${workflow.type}.`,
        );
      }
      if (
        (actor.role === Role.TEAM_LEAD || actor.role === Role.SHIFT_PLANNER) &&
        delegate.organizationUnitId !== actor.organizationUnitId &&
        !HR_LIKE_ROLES.has(delegate.role)
      ) {
        throw new BadRequestException(
          'Team leads and shift planners can only delegate within their own organization unit or to HR/Admin.',
        );
      }

      nextApproverId = command.delegateToId;
      delegationTrail = appendTrail(workflow.delegationTrail, command.delegateToId);
    }

    const updated = await this.prisma.workflowInstance.update({
      where: { id: workflow.id },
      data: {
        status: transition.nextStatus,
        approverId: nextApproverId,
        delegationTrail,
        decisionReason: command.reason ?? workflow.decisionReason,
        decidedAt:
          action === 'APPROVE' || action === 'REJECT' || action === 'CANCEL'
            ? new Date(transition.decidedAt)
            : workflow.decidedAt,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action:
        action === 'DELEGATE'
          ? 'WORKFLOW_DELEGATED'
          : action === 'CANCEL'
            ? 'WORKFLOW_CANCELLED'
            : 'WORKFLOW_DECIDED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      before: {
        status: workflow.status,
        approverId: workflow.approverId,
      },
      after: {
        status: updated.status,
        approverId: updated.approverId,
      },
      reason: command.reason,
    });

    return {
      action,
      previous: workflow,
      updated,
    };
  }

  async listPolicies() {
    return this.prisma.workflowPolicy.findMany({
      orderBy: { type: 'asc' },
    });
  }

  async upsertPolicy(type: WorkflowType, payload: WorkflowPolicyUpsert) {
    const invalidRole = payload.escalationRoles.find(
      (role) => !this.isRoleAllowedForType(role, type),
    );
    if (invalidRole) {
      throw new BadRequestException(
        `Escalation role ${invalidRole} cannot be used for workflow type ${type}.`,
      );
    }

    return this.prisma.workflowPolicy.upsert({
      where: { type },
      create: {
        type,
        escalationDeadlineHours: payload.escalationDeadlineHours,
        escalationRoles: payload.escalationRoles,
        maxDelegationDepth: payload.maxDelegationDepth,
        activeFrom: payload.activeFrom ? new Date(payload.activeFrom) : new Date(),
      },
      update: {
        escalationDeadlineHours: payload.escalationDeadlineHours,
        escalationRoles: payload.escalationRoles,
        maxDelegationDepth: payload.maxDelegationDepth,
        activeFrom: payload.activeFrom ? new Date(payload.activeFrom) : undefined,
      },
    });
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

  async escalateOverdueWorkflows(now = new Date()) {
    const pending = await this.prisma.workflowInstance.findMany({
      where: {
        status: WorkflowStatus.PENDING,
        dueAt: { not: null, lte: now },
      },
      orderBy: { dueAt: 'asc' },
    });

    let escalated = 0;
    for (const workflow of pending) {
      const should = shouldEscalate({
        currentStatus: workflow.status,
        submittedAt: toIso(workflow.submittedAt ?? workflow.createdAt),
        now: toIso(now),
        escalationDeadlineHours: 0,
      });
      if (!should) {
        continue;
      }

      const transition = transitionWorkflow({
        workflowId: workflow.id,
        currentStatus: workflow.status,
        decision: 'ESCALATE',
        actorId: 'system:workflow-escalation',
        at: toIso(now),
      });
      if (!transition.ok) {
        continue;
      }

      const policy = await this.ensurePolicy(workflow.type);
      const escalationRoles = asRoleArray(policy.escalationRoles);
      const targetRole =
        escalationRoles[
          Math.min(workflow.escalationLevel, Math.max(0, escalationRoles.length - 1))
        ] ?? Role.HR;
      const requester = await this.prisma.person.findUnique({
        where: { id: workflow.requesterId },
        select: { organizationUnitId: true },
      });
      const fallbackApprover = await this.firstPersonByRoles(
        [targetRole],
        requester?.organizationUnitId,
        workflow.requesterId,
      );
      const nextApproverId = fallbackApprover ?? workflow.approverId;
      const delegationTrail = appendTrail(workflow.delegationTrail, nextApproverId);

      const updated = await this.prisma.workflowInstance.update({
        where: { id: workflow.id },
        data: {
          status: transition.nextStatus,
          approverId: nextApproverId,
          escalatedAt: now,
          escalationLevel: workflow.escalationLevel + 1,
          delegationTrail,
        },
      });

      await this.auditHelper.appendAudit({
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
          status: updated.status,
          approverId: updated.approverId,
          escalationLevel: updated.escalationLevel,
        },
        reason: 'automatic escalation',
      });

      escalated += 1;
    }

    return { escalated };
  }
}
