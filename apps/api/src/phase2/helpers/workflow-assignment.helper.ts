/** Resolves locked workflow policy versions and eligible approver assignments. */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { resolveDelegation, shouldEscalate, transitionWorkflow } from '@cueq/core';
import type { WorkflowPolicyUpsert } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { lockPolicyWrites } from './transaction-lock.helper.js';
import type { WorkflowAssignmentInput, WorkflowAssignmentResult } from './workflow-utils.js';
import {
  DEFAULT_POLICIES,
  addHours,
  appendTrail,
  asRoleArray,
  isRoleAllowedForType,
  toIso,
} from './workflow-utils.js';

/** Shared advisory-lock scope that serializes workflow routing and policy changes. */
export const WORKFLOW_ROUTING_LOCK_SCOPE = 'workflow-routing';

/**
 * Resolves approvers and policy versions under a routing lock so concurrent requests share one active policy.
 */
@Injectable()
export class WorkflowAssignmentHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async ensurePolicy(type: WorkflowType, tx?: Prisma.TransactionClient): Promise<WorkflowPolicy> {
    if (tx) {
      await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
      return this.ensurePolicyInTransaction(tx, type);
    }

    return this.prisma.$transaction(async (transaction) => {
      await lockPolicyWrites(transaction, WORKFLOW_ROUTING_LOCK_SCOPE);
      return this.ensurePolicyInTransaction(transaction, type);
    });
  }

  private async ensurePolicyInTransaction(
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

  async firstPersonByRoles(
    roles: Role[],
    organizationUnitId?: string,
    excludeId?: string,
    db: Pick<PrismaService, 'person'> = this.prisma,
  ): Promise<string | null> {
    const where: Prisma.PersonWhereInput = {
      role: { in: roles },
      id: excludeId ? { not: excludeId } : undefined,
      organizationUnitId,
    };
    const person =
      (await db.person.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })) ??
      (organizationUnitId
        ? await db.person.findFirst({
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

  private async resolveBaseApprover(
    input: WorkflowAssignmentInput,
    db: Pick<PrismaService, 'person'>,
  ): Promise<string | null> {
    if (input.preferredApproverId) {
      return input.preferredApproverId;
    }

    if (input.type === WorkflowType.SHIFT_SWAP) {
      const planner = await this.firstPersonByRoles(
        [Role.SHIFT_PLANNER],
        input.requesterOrganizationUnitId,
        input.requesterId,
        db,
      );
      if (planner) {
        return planner;
      }

      return this.firstPersonByRoles(
        [Role.HR, Role.ADMIN],
        input.requesterOrganizationUnitId,
        input.requesterId,
        db,
      );
    }

    if (input.type === WorkflowType.POST_CLOSE_CORRECTION) {
      return this.firstPersonByRoles([Role.HR, Role.ADMIN], undefined, input.requesterId, db);
    }

    const teamLead = await this.firstPersonByRoles(
      [Role.TEAM_LEAD],
      input.requesterOrganizationUnitId,
      input.requesterId,
      db,
    );
    if (teamLead) {
      return teamLead;
    }

    return this.firstPersonByRoles(
      [Role.HR, Role.ADMIN],
      input.requesterOrganizationUnitId,
      undefined,
      db,
    );
  }

  private async delegationCandidates(
    input: {
      primaryApproverId: string;
      workflowType: WorkflowType;
      organizationUnitId: string;
      at: Date;
      maxDepth: number;
    },
    db: Pick<PrismaService, 'person' | 'workflowDelegationRule'>,
  ) {
    const candidates: Array<{
      approverId: string;
      isAvailable: boolean;
      activeFrom?: string;
      activeTo?: string;
    }> = [];
    const visited = new Set<string>([input.primaryApproverId]);
    let currentDelegator = input.primaryApproverId;

    for (let depth = 0; depth < input.maxDepth; depth += 1) {
      const rules = await db.workflowDelegationRule.findMany({
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
      const delegates = await db.person.findMany({
        where: { id: { in: delegateIds } },
        select: { id: true, role: true },
      });
      const delegateById = new Map(delegates.map((delegate) => [delegate.id, delegate]));

      const selectedRule = rules.find((rule) => {
        const delegate = delegateById.get(rule.delegateId);
        if (!delegate) {
          return false;
        }

        return isRoleAllowedForType(delegate.role, input.workflowType);
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

  async buildWorkflowAssignment(
    input: WorkflowAssignmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowAssignmentResult> {
    if (tx) {
      return this.buildWorkflowAssignmentInTransaction(tx, input);
    }

    return this.prisma.$transaction((transaction) =>
      this.buildWorkflowAssignmentInTransaction(transaction, input),
    );
  }

  private async buildWorkflowAssignmentInTransaction(
    tx: Prisma.TransactionClient,
    input: WorkflowAssignmentInput,
  ): Promise<WorkflowAssignmentResult> {
    await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
    const policy = await this.ensurePolicyInTransaction(tx, input.type);
    const requestedAt = input.requestedAt ?? new Date();
    const approver = await this.resolveBaseApprover(input, tx);
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

    const candidates = await this.delegationCandidates(
      {
        primaryApproverId: approver,
        workflowType: input.type,
        organizationUnitId: input.requesterOrganizationUnitId,
        at: requestedAt,
        maxDepth: Math.max(1, policy.maxDelegationDepth),
      },
      tx,
    );
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

  /* ── Policy CRUD ─────────────────────────────────────────── */

  async getPolicy(type: WorkflowType) {
    return this.prisma.workflowPolicy.findFirst({
      where: { type, activeTo: null },
      orderBy: { activeFrom: 'desc' },
    });
  }

  async listPolicies() {
    return this.prisma.workflowPolicy.findMany({
      where: { activeTo: null },
      orderBy: { type: 'asc' },
    });
  }

  async listPolicyHistory(type: WorkflowType) {
    const entries = await this.prisma.workflowPolicy.findMany({
      where: { type },
      orderBy: { activeFrom: 'desc' },
    });
    return { entries, total: entries.length };
  }

  async upsertPolicy(type: WorkflowType, payload: WorkflowPolicyUpsert, actorId?: string) {
    const invalidRole = payload.escalationRoles.find((role) => !isRoleAllowedForType(role, type));
    if (invalidRole) {
      throw new BadRequestException(
        `Escalation role ${invalidRole} cannot be used for workflow type ${type}.`,
      );
    }

    const activeFrom = payload.activeFrom ? new Date(payload.activeFrom) : new Date();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
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
        await this.auditHelper.appendAudit(
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

  /* ── Escalation ──────────────────────────────────────────── */

  async escalateOverdueWorkflows(now = new Date()) {
    const pending = await this.prisma.workflowInstance.findMany({
      where: {
        status: WorkflowStatus.PENDING,
        dueAt: { not: null, lte: now },
      },
      orderBy: { dueAt: 'asc' },
    });

    let escalated = 0;
    for (const candidate of pending) {
      const didEscalate = await this.prisma.$transaction(async (tx) => {
        await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
        const workflow = await tx.workflowInstance.findUnique({ where: { id: candidate.id } });
        if (
          !workflow ||
          workflow.status !== WorkflowStatus.PENDING ||
          workflow.escalationLevel !== candidate.escalationLevel ||
          !workflow.dueAt ||
          workflow.dueAt > now
        ) {
          return false;
        }

        const should = shouldEscalate({
          currentStatus: workflow.status,
          submittedAt: toIso(workflow.submittedAt ?? workflow.createdAt),
          now: toIso(now),
          escalationDeadlineHours: 0,
        });
        if (!should) {
          return false;
        }

        const transition = transitionWorkflow({
          workflowId: workflow.id,
          currentStatus: workflow.status,
          decision: 'ESCALATE',
          actorId: 'system:workflow-escalation',
          at: toIso(now),
        });
        if (!transition.ok) {
          return false;
        }

        const policy = await this.ensurePolicyInTransaction(tx, workflow.type);
        const escalationRoles = asRoleArray(policy.escalationRoles);
        const targetRole =
          escalationRoles[
            Math.min(workflow.escalationLevel, Math.max(0, escalationRoles.length - 1))
          ] ?? Role.HR;
        const requester = await tx.person.findUnique({
          where: { id: workflow.requesterId },
          select: { organizationUnitId: true },
        });
        const fallbackApprover = await this.firstPersonByRoles(
          [targetRole],
          requester?.organizationUnitId,
          workflow.requesterId,
          tx,
        );
        const nextApproverId = fallbackApprover ?? workflow.approverId;
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
            status: transition.nextStatus,
            approverId: nextApproverId,
            escalatedAt: now,
            escalationLevel: workflow.escalationLevel + 1,
            delegationTrail,
          },
        });
        if (result.count === 0) {
          return false;
        }

        await this.auditHelper.appendAudit(
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
              status: transition.nextStatus,
              approverId: nextApproverId,
              escalationLevel: workflow.escalationLevel + 1,
            },
            reason: 'automatic escalation',
          },
          tx,
        );

        return true;
      });

      if (didEscalate) {
        escalated += 1;
      }
    }

    return { escalated };
  }
}
