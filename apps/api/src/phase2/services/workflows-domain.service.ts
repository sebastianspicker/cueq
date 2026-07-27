/** Provides actor-scoped workflow inbox, delegation, policy, and decision operations. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { type Prisma, WorkflowType } from '@cueq/database';
import {
  CreateWorkflowDelegationRuleSchema,
  BookingCorrectionSchema,
  OvertimeApprovalRequestSchema,
  ShiftSwapRequestSchema,
  UpdateWorkflowDelegationRuleSchema,
  WorkflowDecisionCommandSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import { assertHrLikeRole } from '../helpers/role-constants.js';
import { WorkflowCreationHelper } from '../helpers/workflow-creation.helper.js';
import { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper.js';
import { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import type { ClosingBlockedAttemptInput } from '../helpers/closing-lock.helper.js';
import { lockPersonWrites, lockRosterWrites } from '../helpers/transaction-lock.helper.js';

type DecisionWorkflowScope = {
  type: WorkflowType;
  entityType: string;
  entityId: string;
  requestPayload: unknown;
};

type GuardedRange = { from: Date; to: Date };

/**
 * API-facing workflow operations that enforce actor scope before delegating state changes to the runtime service.
 */
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
    if (!workflowScope) return null;

    const scope = workflowScope as DecisionWorkflowScope;
    return (
      (await this.guardBookingCorrection(
        tx,
        scope,
        requestedAction,
        actorId,
        recordBlockedAttempt,
      )) ??
      (await this.guardAbsence(tx, scope, requestedAction, actorId, recordBlockedAttempt)) ??
      (await this.guardShiftSwap(tx, scope, requestedAction, actorId, recordBlockedAttempt)) ??
      this.guardOvertime(tx, scope, requestedAction, actorId, recordBlockedAttempt)
    );
  }

  private async guardBookingCorrection(
    tx: Prisma.TransactionClient,
    scope: DecisionWorkflowScope,
    action: string,
    actorId: string,
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput | null> {
    if (!this.isBookingCorrectionApproval(scope, action)) return null;

    const correction = BookingCorrectionSchema.parse(scope.requestPayload ?? {});
    const booking = await this.loadBookingForCorrection(tx, scope.entityId);
    this.assertCorrectionMatchesBooking(correction, booking, scope.entityId);
    const ranges = this.correctionRanges(booking, correction);
    const blockedAttempt = await this.guardBookingRanges(
      tx,
      booking.person.organizationUnitId,
      scope.entityId,
      actorId,
      ranges,
      recordBlockedAttempt,
    );
    await lockPersonWrites(tx, [booking.personId]);
    await this.assertBookingUnchanged(tx, scope.entityId, booking);
    return blockedAttempt;
  }

  private isBookingCorrectionApproval(scope: DecisionWorkflowScope, action: string): boolean {
    return (
      scope.type === WorkflowType.BOOKING_CORRECTION &&
      scope.entityType === 'Booking' &&
      action === 'APPROVE'
    );
  }

  private async loadBookingForCorrection(tx: Prisma.TransactionClient, id: string) {
    const booking = await tx.booking.findUnique({
      where: { id },
      select: {
        personId: true,
        startTime: true,
        endTime: true,
        person: { select: { organizationUnitId: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found for approved correction.');
    return booking;
  }

  private assertCorrectionMatchesBooking(
    correction: { bookingId: string; startTime?: string; endTime?: string },
    booking: { startTime: Date; endTime: Date | null },
    bookingId: string,
  ): void {
    if (correction.bookingId !== bookingId) {
      throw new BadRequestException(
        'Booking correction payload does not match its workflow target.',
      );
    }
    const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
    const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
    if (endTime && startTime >= endTime) {
      throw new BadRequestException('Corrected booking endTime must be after startTime.');
    }
  }

  private correctionRanges(
    booking: { startTime: Date; endTime: Date | null },
    correction: { startTime?: string; endTime?: string },
  ): GuardedRange[] {
    const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
    const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
    const candidates = [
      { from: booking.startTime, to: booking.endTime ?? booking.startTime },
      { from: startTime, to: endTime ?? startTime },
    ];
    const uniqueRanges = new Map<string, GuardedRange>();
    for (const range of candidates) {
      uniqueRanges.set(`${range.from.getTime()}:${range.to.getTime()}`, range);
    }
    return [...uniqueRanges.values()].sort(
      (left, right) =>
        left.from.getTime() - right.from.getTime() || left.to.getTime() - right.to.getTime(),
    );
  }

  private async guardBookingRanges(
    tx: Prisma.TransactionClient,
    organizationUnitId: string,
    bookingId: string,
    actorId: string,
    ranges: GuardedRange[],
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput> {
    let latestAttempt: ClosingBlockedAttemptInput | null = null;
    for (const range of ranges) {
      latestAttempt = this.blockedAttempt(
        actorId,
        organizationUnitId,
        range,
        'WORKFLOW_BOOKING_CORRECTION_APPROVE',
        'Booking',
        bookingId,
      );
      recordBlockedAttempt(latestAttempt);
      await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
        { organizationUnitId, ...range },
        tx,
      );
    }
    if (!latestAttempt) {
      throw new Error('Booking correction requires at least one guarded time range.');
    }
    return latestAttempt;
  }

  private async assertBookingUnchanged(
    tx: Prisma.TransactionClient,
    bookingId: string,
    expected: {
      personId: string;
      startTime: Date;
      endTime: Date | null;
      person: { organizationUnitId: string };
    },
  ): Promise<void> {
    const current = await this.loadBookingForCorrection(tx, bookingId);
    if (this.bookingsMatch(current, expected)) return;

    throw new ConflictException({
      code: 'BOOKING_CHANGED',
      message: 'Booking changed while preparing the correction; retry the workflow decision.',
      retryable: true,
    });
  }

  private bookingsMatch(
    current: {
      personId: string;
      startTime: Date;
      endTime: Date | null;
      person: { organizationUnitId: string };
    },
    expected: {
      personId: string;
      startTime: Date;
      endTime: Date | null;
      person: { organizationUnitId: string };
    },
  ): boolean {
    return (
      current.personId === expected.personId &&
      current.person.organizationUnitId === expected.person.organizationUnitId &&
      current.startTime.getTime() === expected.startTime.getTime() &&
      current.endTime?.getTime() === expected.endTime?.getTime()
    );
  }

  private async guardAbsence(
    tx: Prisma.TransactionClient,
    scope: DecisionWorkflowScope,
    action: string,
    actorId: string,
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput | null> {
    if (scope.entityType !== 'Absence' || !['APPROVE', 'REJECT', 'CANCEL'].includes(action)) {
      return null;
    }
    const absence = await tx.absence.findUnique({
      where: { id: scope.entityId },
      select: {
        personId: true,
        startDate: true,
        endDate: true,
        person: { select: { organizationUnitId: true } },
      },
    });
    if (!absence) return null;

    const range = { from: absence.startDate, to: absence.endDate };
    const attempt = this.blockedAttempt(
      actorId,
      absence.person.organizationUnitId,
      range,
      `WORKFLOW_ABSENCE_${action}`,
      'Absence',
      scope.entityId,
    );
    recordBlockedAttempt(attempt);
    await this.guardPersonRange(tx, absence.personId, absence.person.organizationUnitId, range);
    return attempt;
  }

  private async guardShiftSwap(
    tx: Prisma.TransactionClient,
    scope: DecisionWorkflowScope,
    action: string,
    actorId: string,
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput | null> {
    if (
      scope.type !== WorkflowType.SHIFT_SWAP ||
      scope.entityType !== 'Shift' ||
      action !== 'APPROVE'
    ) {
      return null;
    }
    const swap = ShiftSwapRequestSchema.parse(scope.requestPayload ?? {});
    const shiftId = swap.shiftId || scope.entityId;
    const shift = await tx.shift.findUnique({
      where: { id: shiftId },
      select: {
        rosterId: true,
        startTime: true,
        endTime: true,
        roster: { select: { organizationUnitId: true } },
      },
    });
    if (!shift) return null;

    const range = { from: shift.startTime, to: shift.endTime };
    const attempt = this.blockedAttempt(
      actorId,
      shift.roster.organizationUnitId,
      range,
      'WORKFLOW_SHIFT_SWAP_APPROVE',
      'Shift',
      shiftId,
    );
    recordBlockedAttempt(attempt);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
      { organizationUnitId: shift.roster.organizationUnitId, ...range },
      tx,
    );
    await lockRosterWrites(tx, [shift.rosterId]);
    await lockPersonWrites(tx, [swap.fromPersonId, swap.toPersonId]);
    return attempt;
  }

  private async guardOvertime(
    tx: Prisma.TransactionClient,
    scope: DecisionWorkflowScope,
    action: string,
    actorId: string,
    recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void,
  ): Promise<ClosingBlockedAttemptInput | null> {
    if (
      scope.type !== WorkflowType.OVERTIME_APPROVAL ||
      scope.entityType !== 'TimeAccount' ||
      action !== 'APPROVE'
    ) {
      return null;
    }
    const overtime = OvertimeApprovalRequestSchema.parse(scope.requestPayload ?? {});
    const person = await tx.person.findUnique({
      where: { id: overtime.personId },
      select: { organizationUnitId: true },
    });
    if (!person) return null;

    const range = { from: new Date(overtime.periodStart), to: new Date(overtime.periodEnd) };
    const attempt = this.blockedAttempt(
      actorId,
      person.organizationUnitId,
      range,
      'WORKFLOW_OVERTIME_APPROVE',
      'TimeAccount',
      scope.entityId,
    );
    recordBlockedAttempt(attempt);
    await this.guardPersonRange(tx, overtime.personId, person.organizationUnitId, range);
    return attempt;
  }

  private blockedAttempt(
    actorId: string,
    organizationUnitId: string,
    range: GuardedRange,
    attemptedAction: string,
    entityType: string,
    entityId: string,
  ): ClosingBlockedAttemptInput {
    return { actorId, organizationUnitId, ...range, attemptedAction, entityType, entityId };
  }

  private async guardPersonRange(
    tx: Prisma.TransactionClient,
    personId: string,
    organizationUnitId: string,
    range: GuardedRange,
  ): Promise<void> {
    await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
      { organizationUnitId, ...range },
      tx,
    );
    await lockPersonWrites(tx, [personId]);
    await this.assertLockedPersonOrganizationUnit(tx, personId, organizationUnitId);
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
