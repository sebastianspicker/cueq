/** Coordinates transactional workflow routing, decisions, delegation, and escalation. */
import {
  BadRequestException,
  ConflictException,
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
import { PrismaService } from '../persistence/prisma.service.js';
import { AuditHelper } from './helpers/audit.helper.js';
import { HR_LIKE_ROLES } from './helpers/role-constants.js';
import { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper.js';
import { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper.js';
import { lockPersonWrites } from './helpers/transaction-lock.helper.js';
import type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
} from './helpers/workflow-utils.js';
import {
  appendTrail,
  isRoleAllowedForType,
  isWorkflowFinal,
  toIso,
} from './helpers/workflow-utils.js';

export type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
};

/**
 * Coordinates workflow routing, decisions, delegation, escalation, and their audit trail.
 * State changes run under person and policy locks to preserve a single valid transition history.
 */
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
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowDecisionResult> {
    const db = tx ?? this.prisma;
    const action = this.normalizeAction(command);
    const workflow = await db.workflowInstance.findUnique({
      where: { id: command.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }
    await this.validateDecision(actor, workflow, action, command.reason);
    const transition = this.transitionDecision(actor, workflow, action, command.reason);
    const routing = await this.resolveDecisionRouting(actor, workflow, action, command, tx);
    const updated = await this.persistDecision(db, workflow, action, command, transition, routing);
    await this.appendDecisionAudit(actor.id, action, workflow, updated, command.reason, db);

    return {
      action,
      previous: workflow,
      updated,
    };
  }

  private async validateDecision(
    actor: WorkflowActor,
    workflow: WorkflowInstance,
    action: WorkflowAction,
    reason?: string,
  ) {
    if (!this.availableActions(workflow, actor).includes(action)) {
      throw new ForbiddenException('Action is not allowed for this actor and workflow state.');
    }
    if (action !== 'CANCEL' && !isRoleAllowedForType(actor.role, workflow.type)) {
      throw new ForbiddenException('Role cannot decide this workflow type.');
    }
    if (action === 'APPROVE') {
      await this.sideEffectsHelper.validatePostCloseSelfApproval(actor.id, workflow, reason);
    }
  }

  private transitionDecision(
    actor: WorkflowActor,
    workflow: WorkflowInstance,
    action: WorkflowAction,
    reason?: string,
  ) {
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

  private async resolveDecisionRouting(
    actor: WorkflowActor,
    workflow: WorkflowInstance,
    action: WorkflowAction,
    command: WorkflowDecisionCommand,
    tx?: Prisma.TransactionClient,
  ) {
    if (action !== 'DELEGATE') {
      return {
        nextApproverId: workflow.approverId,
        delegationTrail: appendTrail(workflow.delegationTrail, workflow.approverId),
      };
    }
    if (!command.delegateToId) {
      throw new BadRequestException('delegateToId is required for DELEGATE.');
    }
    if (tx) await lockPersonWrites(tx, [command.delegateToId]);
    await this.delegationCrud.validateInlineDelegation(
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

  private async persistDecision(
    db: PrismaService | Prisma.TransactionClient,
    workflow: WorkflowInstance,
    action: WorkflowAction,
    command: WorkflowDecisionCommand,
    transition: ReturnType<typeof transitionWorkflow> & { ok: true },
    routing: { nextApproverId: string | null; delegationTrail: string[] },
  ) {
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

  private async appendDecisionAudit(
    actorId: string,
    action: WorkflowAction,
    workflow: WorkflowInstance,
    updated: WorkflowInstance,
    reason: string | undefined,
    db: PrismaService | Prisma.TransactionClient,
  ) {
    const auditAction =
      action === 'DELEGATE'
        ? 'WORKFLOW_DELEGATED'
        : action === 'CANCEL'
          ? 'WORKFLOW_CANCELLED'
          : 'WORKFLOW_DECIDED';
    await this.auditHelper.appendAudit(
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

  /* ── Delegated to Helpers ────────────────────────────────── */

  async buildWorkflowAssignment(
    input: WorkflowAssignmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowAssignmentResult> {
    return this.assignmentHelper.buildWorkflowAssignment(input, tx);
  }

  async listPolicies(): Promise<WorkflowPolicy[]> {
    return this.assignmentHelper.listPolicies();
  }

  async getPolicy(type: WorkflowType): Promise<WorkflowPolicy | null> {
    return this.assignmentHelper.getPolicy(type);
  }

  async listPolicyHistory(
    type: WorkflowType,
  ): Promise<{ entries: WorkflowPolicy[]; total: number }> {
    return this.assignmentHelper.listPolicyHistory(type);
  }

  async upsertPolicy(
    type: WorkflowType,
    payload: WorkflowPolicyUpsert,
    actorId?: string,
  ): Promise<WorkflowPolicy> {
    return this.assignmentHelper.upsertPolicy(type, payload, actorId);
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
