import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service';
import { type Prisma, WorkflowType } from '@cueq/database';
import {
  CreateWorkflowDelegationRuleSchema,
  OvertimeApprovalRequestSchema,
  ShiftSwapRequestSchema,
  UpdateWorkflowDelegationRuleSchema,
  WorkflowDecisionCommandSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { WorkflowRuntimeService } from '../workflow-runtime.service';
import { assertHrLikeRole } from '../helpers/role-constants';
import { WorkflowCreationHelper } from '../helpers/workflow-creation.helper';
import { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper';
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import type { ClosingBlockedAttemptInput } from '../helpers/closing-lock.helper';
import { lockPersonWrites, lockRosterWrites } from '../helpers/transaction-lock.helper';

@Injectable()
export class WorkflowsDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
    @Inject(WorkflowCreationHelper) private readonly creationHelper: WorkflowCreationHelper,
    @Inject(WorkflowSideEffectsHelper)
    private readonly sideEffectsHelper: WorkflowSideEffectsHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  /* ── Workflow Creation (delegated) ─────────────────────────── */

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.creationHelper.createBookingCorrection(user, payload);
  }

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.creationHelper.createShiftSwapWorkflow(user, payload);
  }

  async createOvertimeApprovalWorkflow(
    user: AuthenticatedIdentity,
    payload: unknown,
  ): Promise<unknown> {
    return this.creationHelper.createOvertimeApprovalWorkflow(user, payload);
  }

  /* ── Inbox & Detail ──────────────────────────────────────────── */

  async workflowInbox(user: AuthenticatedIdentity, query?: unknown): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);
    const parsed = WorkflowInboxQuerySchema.parse(query ?? {});

    return this.workflowRuntimeService.listInbox(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      parsed,
    );
  }

  async workflowDetail(user: AuthenticatedIdentity, workflowId: string): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);
    return this.workflowRuntimeService.getDetail(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      workflowId,
    );
  }

  /* ── Workflow Policies ───────────────────────────────────────── */

  async listWorkflowPolicies(user: AuthenticatedIdentity): Promise<unknown> {
    assertHrLikeRole(user);
    return this.workflowRuntimeService.listPolicies();
  }

  async getWorkflowPolicy(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type) as WorkflowType;
    return this.workflowRuntimeService.getPolicy(parsedType);
  }

  async listWorkflowPolicyHistory(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type) as WorkflowType;
    return this.workflowRuntimeService.listPolicyHistory(parsedType);
  }

  async upsertWorkflowPolicy(
    user: AuthenticatedIdentity,
    type: string,
    payload: unknown,
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsedType = WorkflowTypeSchema.parse(type);
    const parsedPayload = WorkflowPolicyUpsertSchema.parse(payload);
    return this.workflowRuntimeService.upsertPolicy(
      parsedType as WorkflowType,
      parsedPayload,
      actor.id,
    );
  }

  /* ── Workflow Delegations ────────────────────────────────────── */

  async listWorkflowDelegations(
    user: AuthenticatedIdentity,
    query: { delegatorId?: string; workflowType?: string },
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const workflowType = query.workflowType
      ? (WorkflowTypeSchema.parse(query.workflowType) as WorkflowType)
      : undefined;
    return this.workflowRuntimeService.listDelegations({
      delegatorId: query.delegatorId,
      workflowType,
    });
  }

  async createWorkflowDelegation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.createDelegation(actor.id, {
      delegatorId: parsed.delegatorId,
      delegateId: parsed.delegateId,
      workflowType: parsed.workflowType as WorkflowType | undefined,
      organizationUnitId: parsed.organizationUnitId,
      activeFrom: parsed.activeFrom,
      activeTo: parsed.activeTo,
      isActive: parsed.isActive,
      priority: parsed.priority,
    });
  }

  async updateWorkflowDelegation(
    user: AuthenticatedIdentity,
    id: string,
    payload: unknown,
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = UpdateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.updateDelegation(actor.id, id, {
      delegateId: parsed.delegateId,
      workflowType: parsed.workflowType as WorkflowType | null | undefined,
      organizationUnitId: parsed.organizationUnitId,
      activeFrom: parsed.activeFrom,
      activeTo: parsed.activeTo,
      isActive: parsed.isActive,
      priority: parsed.priority,
    });
  }

  async deleteWorkflowDelegation(user: AuthenticatedIdentity, id: string): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    await this.workflowRuntimeService.deleteDelegation(actor.id, id);
    return { deleted: true, id };
  }

  /* ── Workflow Decision (orchestration) ───────────────────────── */

  async decideWorkflow(
    user: AuthenticatedIdentity,
    workflowId: string,
    payload: unknown,
  ): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsed = WorkflowDecisionCommandSchema.parse({
      ...(payload as Record<string, unknown>),
      workflowId,
    });
    const requestedAction = this.workflowRuntimeService.normalizeAction(parsed);
    let blockedAttempt: ClosingBlockedAttemptInput | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        blockedAttempt = await this.prepareDecisionGuards(
          tx,
          workflowId,
          requestedAction,
          actor.id,
          (attempt) => {
            blockedAttempt = attempt;
          },
        );

        if (requestedAction === 'APPROVE') {
          await this.sideEffectsHelper.validatePreApproval(workflowId, tx);
        }

        const decision = await this.workflowRuntimeService.decide(
          { id: actor.id, role: user.role, organizationUnitId: actor.organizationUnitId },
          parsed,
          tx,
        );

        await this.sideEffectsHelper.applyDecisionSideEffects(
          actor.id,
          decision,
          parsed.reason,
          tx,
        );

        return decision.updated;
      });

      return result;
    } catch (error) {
      if (blockedAttempt) {
        return this.closingLockHelper.rethrowWithDurableClosingAudit(error, blockedAttempt);
      }
      throw error;
    }
  }

  private async prepareDecisionGuards(
    tx: Prisma.TransactionClient,
    workflowId: string,
    requestedAction: string,
    actorId: string,
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput | null> {
    const workflowScope = await tx.workflowInstance.findUnique({
      where: { id: workflowId },
      select: { type: true, entityType: true, entityId: true, requestPayload: true },
    });
    if (
      workflowScope?.entityType === 'Absence' &&
      ['APPROVE', 'REJECT', 'CANCEL'].includes(requestedAction)
    ) {
      const absence = await tx.absence.findUnique({
        where: { id: workflowScope.entityId },
        select: {
          personId: true,
          startDate: true,
          endDate: true,
          person: { select: { organizationUnitId: true } },
        },
      });
      if (absence) {
        const blockedAttempt = {
          actorId,
          organizationUnitId: absence.person.organizationUnitId,
          from: absence.startDate,
          to: absence.endDate,
          attemptedAction: `WORKFLOW_ABSENCE_${requestedAction}`,
          entityType: 'Absence',
          entityId: workflowScope.entityId,
        };
        recordBlockedAttempt(blockedAttempt);
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: absence.person.organizationUnitId,
            from: absence.startDate,
            to: absence.endDate,
          },
          tx,
        );
        await lockPersonWrites(tx, [absence.personId]);
        await this.assertLockedPersonOrganizationUnit(
          tx,
          absence.personId,
          absence.person.organizationUnitId,
        );
        return blockedAttempt;
      }
    }

    if (
      workflowScope?.type === WorkflowType.SHIFT_SWAP &&
      workflowScope.entityType === 'Shift' &&
      requestedAction === 'APPROVE'
    ) {
      const swap = ShiftSwapRequestSchema.parse(workflowScope.requestPayload ?? {});
      const shift = await tx.shift.findUnique({
        where: { id: swap.shiftId || workflowScope.entityId },
        select: {
          rosterId: true,
          startTime: true,
          endTime: true,
          roster: { select: { organizationUnitId: true } },
        },
      });
      if (shift) {
        const blockedAttempt = {
          actorId,
          organizationUnitId: shift.roster.organizationUnitId,
          from: shift.startTime,
          to: shift.endTime,
          attemptedAction: 'WORKFLOW_SHIFT_SWAP_APPROVE',
          entityType: 'Shift',
          entityId: swap.shiftId || workflowScope.entityId,
        };
        recordBlockedAttempt(blockedAttempt);
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: shift.roster.organizationUnitId,
            from: shift.startTime,
            to: shift.endTime,
          },
          tx,
        );
        await lockRosterWrites(tx, [shift.rosterId]);
        await lockPersonWrites(tx, [swap.fromPersonId, swap.toPersonId]);
        return blockedAttempt;
      }
    }

    if (
      workflowScope?.type === WorkflowType.OVERTIME_APPROVAL &&
      workflowScope.entityType === 'TimeAccount' &&
      requestedAction === 'APPROVE'
    ) {
      const overtime = OvertimeApprovalRequestSchema.parse(workflowScope.requestPayload ?? {});
      const person = await tx.person.findUnique({
        where: { id: overtime.personId },
        select: { organizationUnitId: true },
      });
      if (person) {
        const blockedAttempt = {
          actorId,
          organizationUnitId: person.organizationUnitId,
          from: new Date(overtime.periodStart),
          to: new Date(overtime.periodEnd),
          attemptedAction: 'WORKFLOW_OVERTIME_APPROVE',
          entityType: 'TimeAccount',
          entityId: workflowScope.entityId,
        };
        recordBlockedAttempt(blockedAttempt);
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: person.organizationUnitId,
            from: new Date(overtime.periodStart),
            to: new Date(overtime.periodEnd),
          },
          tx,
        );
        await lockPersonWrites(tx, [overtime.personId]);
        await this.assertLockedPersonOrganizationUnit(
          tx,
          overtime.personId,
          person.organizationUnitId,
        );
        return blockedAttempt;
      }
    }

    return null;
  }

  private async assertLockedPersonOrganizationUnit(
    tx: Prisma.TransactionClient,
    personId: string,
    expectedOrganizationUnitId: string,
  ) {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    if (person.organizationUnitId !== expectedOrganizationUnitId) {
      throw new ConflictException({
        code: 'PERSON_IDENTITY_CHANGED',
        message: 'Person organization assignment changed; retry the workflow decision.',
        retryable: true,
      });
    }
  }
}
