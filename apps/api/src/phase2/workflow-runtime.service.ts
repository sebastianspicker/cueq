import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus, type WorkflowType } from '@cueq/database';
import { transitionWorkflow, type WorkflowDecision } from '@cueq/core';
import type {
  WorkflowAction,
  WorkflowDecisionCommand,
  WorkflowInboxQuery,
  WorkflowPolicyUpsert,
} from '@cueq/shared';
import { PrismaService } from '../persistence/prisma.service';
import { AuditHelper } from './helpers/audit.helper';
import { HR_LIKE_ROLES } from './helpers/role-constants';
import { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper';
import { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper';
import { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper';
import type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
} from './helpers/workflow-utils';
import {
  appendTrail,
  isRoleAllowedForType,
  isWorkflowFinal,
  toIso,
} from './helpers/workflow-utils';

export type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
};

@Injectable()
export class WorkflowRuntimeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowAssignmentHelper) private readonly assignmentHelper: WorkflowAssignmentHelper,
    @Inject(WorkflowDelegationCrudHelper)
    private readonly delegationCrud: WorkflowDelegationCrudHelper,
    @Inject(WorkflowSideEffectsHelper)
    private readonly sideEffectsHelper: WorkflowSideEffectsHelper,
  ) {}

  /* ── Action Helpers ──────────────────────────────────────── */

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
      isRoleAllowedForType(actor.role, workflow.type) &&
      (workflow.status === WorkflowStatus.PENDING || workflow.status === WorkflowStatus.ESCALATED)
    ) {
      actions.add('APPROVE');
      actions.add('REJECT');
      actions.add('DELEGATE');
    }

    return [...actions];
  }

  /* ── Visibility ──────────────────────────────────────────── */

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

  /* ── Inbox & Detail ──────────────────────────────────────── */

  async listInbox(
    actor: WorkflowActor,
    query: WorkflowInboxQuery,
  ): Promise<Array<WorkflowInstance & { isOverdue: boolean; availableActions: WorkflowAction[] }>> {
    const now = new Date();
    const where: Prisma.WorkflowInstanceWhereInput = HR_LIKE_ROLES.has(actor.role)
      ? { status: query.status, type: query.type }
      : {
          status: query.status,
          type: query.type,
          OR: [{ requesterId: actor.id }, { approverId: actor.id }],
        };
    const workflows = await this.prisma.workflowInstance.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const visible = workflows.map((workflow) => this.withVisibility(workflow, actor, now));
    if (query.overdueOnly) {
      return visible.filter((workflow) => workflow.isOverdue);
    }
    return visible;
  }

  async getDetail(
    actor: WorkflowActor,
    workflowId: string,
  ): Promise<WorkflowInstance & { isOverdue: boolean; availableActions: WorkflowAction[] }> {
    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    this.ensureMayAccessWorkflow(workflow, actor);
    return this.withVisibility(workflow, actor, new Date());
  }

  /* ── Decision ────────────────────────────────────────────── */

  async decide(
    actor: WorkflowActor,
    command: WorkflowDecisionCommand,
    tx?: Pick<PrismaService, 'workflowInstance'>,
  ): Promise<WorkflowDecisionResult> {
    const db = tx ?? this.prisma;
    const action = this.normalizeAction(command);
    const workflow = await db.workflowInstance.findUnique({
      where: { id: command.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const actions = this.availableActions(workflow, actor);
    if (!actions.includes(action)) {
      throw new ForbiddenException('Action is not allowed for this actor and workflow state.');
    }

    if (action !== 'CANCEL' && !isRoleAllowedForType(actor.role, workflow.type)) {
      throw new ForbiddenException('Role cannot decide this workflow type.');
    }

    if (action === 'APPROVE') {
      await this.sideEffectsHelper.validatePostCloseSelfApproval(
        actor.id,
        workflow,
        command.reason,
      );
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
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: transition.violations.join('; '),
        details: transition.violations,
      });
    }

    let nextApproverId = workflow.approverId;
    let delegationTrail = appendTrail(workflow.delegationTrail, workflow.approverId);
    if (action === 'DELEGATE') {
      if (!command.delegateToId) {
        throw new BadRequestException('delegateToId is required for DELEGATE.');
      }
      await this.delegationCrud.validateInlineDelegation({
        delegateToId: command.delegateToId,
        actorId: actor.id,
        actorRole: actor.role,
        actorOrganizationUnitId: actor.organizationUnitId,
        requesterId: workflow.requesterId,
        workflowType: workflow.type,
      });

      nextApproverId = command.delegateToId;
      delegationTrail = appendTrail(workflow.delegationTrail, command.delegateToId);
    }

    const updated = await db.workflowInstance.update({
      where: { id: workflow.id, status: workflow.status },
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

  /* ── Delegated to Helpers ────────────────────────────────── */

  async buildWorkflowAssignment(input: WorkflowAssignmentInput): Promise<WorkflowAssignmentResult> {
    return this.assignmentHelper.buildWorkflowAssignment(input);
  }

  async listPolicies(): Promise<WorkflowPolicy[]> {
    return this.assignmentHelper.listPolicies();
  }

  async getPolicy(type: WorkflowType): Promise<WorkflowPolicy | null> {
    return this.assignmentHelper.getPolicy(type);
  }

  async listPolicyHistory(type: WorkflowType): Promise<WorkflowPolicy[]> {
    return this.assignmentHelper.listPolicyHistory(type);
  }

  async upsertPolicy(type: WorkflowType, payload: WorkflowPolicyUpsert): Promise<WorkflowPolicy> {
    return this.assignmentHelper.upsertPolicy(type, payload);
  }

  async escalateOverdueWorkflows(now = new Date()) {
    return this.assignmentHelper.escalateOverdueWorkflows(now);
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return this.delegationCrud.listDelegations(query);
  }

  async createDelegation(
    actorId: string,
    payload: Parameters<WorkflowDelegationCrudHelper['createDelegation']>[1],
  ) {
    return this.delegationCrud.createDelegation(actorId, payload);
  }

  async updateDelegation(
    actorId: string,
    id: string,
    payload: Parameters<WorkflowDelegationCrudHelper['updateDelegation']>[2],
  ) {
    return this.delegationCrud.updateDelegation(actorId, id, payload);
  }

  async deleteDelegation(actorId: string, id: string) {
    return this.delegationCrud.deleteDelegation(actorId, id);
  }
}
