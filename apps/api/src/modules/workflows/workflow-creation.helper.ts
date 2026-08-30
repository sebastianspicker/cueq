/** Creates domain-specific workflow requests with transactional routing and audit evidence. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { WorkflowType } from '@cueq/database';
import {
  BookingCorrectionSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { PersonHelper, assertCanActForPerson } from '../people/public.js';
import { AuditHelper } from '../audit/public.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';
import {
  lockPersonWrites,
  lockPolicyWrites,
  lockRosterWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { WORKFLOW_ROUTING_LOCK_SCOPE } from './workflow-assignment.helper.js';
import type { WorkflowAssignmentResult } from './workflow-contracts.js';

/**
 * Creates domain-specific workflow requests with routing, entity locks, and creation audit evidence in one transaction.
 */
@Injectable()
export class WorkflowCreationHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  private async createWorkflowAndAppendCreationAudit(
    tx: Prisma.TransactionClient,
    input: {
      type: WorkflowType;
      requesterId: string;
      entityType: string;
      entityId: string;
      reason: string;
      requestPayload: Prisma.InputJsonValue;
      assignment: WorkflowAssignmentResult;
      auditAfter: Prisma.JsonObject;
    },
  ) {
    const created = await tx.workflowInstance.create({
      data: {
        type: input.type,
        status: input.assignment.status,
        requesterId: input.requesterId,
        approverId: input.assignment.approverId,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason,
        requestPayload: input.requestPayload,
        submittedAt: input.assignment.submittedAt,
        dueAt: input.assignment.dueAt,
        escalationLevel: input.assignment.escalationLevel,
        delegationTrail: input.assignment.delegationTrail,
      },
    });

    await this.auditHelper.appendAudit(
      {
        actorId: input.requesterId,
        action: 'WORKFLOW_CREATED',
        entityType: 'WorkflowInstance',
        entityId: created.id,
        after: {
          type: created.type,
          status: created.status,
          approverId: created.approverId,
          dueAt: created.dueAt?.toISOString() ?? null,
          ...input.auditAfter,
        },
        reason: input.reason,
      },
      tx,
    );

    return created;
  }

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = BookingCorrectionSchema.parse(payload);

    const { workflow, assignment } = await this.prisma.$transaction(async (tx) => {
      await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
      const routingBooking = await tx.booking.findUnique({
        where: { id: parsed.bookingId },
        select: { personId: true },
      });
      if (!routingBooking) {
        throw new NotFoundException('Booking not found.');
      }

      assertCanActForPerson(user, requester.id, routingBooking.personId);
      await lockPersonWrites(tx, [routingBooking.personId]);
      const booking = await tx.booking.findUnique({
        where: { id: parsed.bookingId },
        include: {
          person: {
            select: { id: true, organizationUnitId: true, supervisorId: true },
          },
        },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found.');
      }
      if (booking.personId !== routingBooking.personId) {
        throw new ConflictException({
          code: 'BOOKING_OWNER_CHANGED',
          message: 'Booking ownership changed; retry the correction request.',
          retryable: true,
        });
      }

      const preferredApproverId =
        booking.personId === requester.id ? (booking.person.supervisorId ?? undefined) : undefined;
      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.BOOKING_CORRECTION,
          requesterId: requester.id,
          requesterOrganizationUnitId: booking.person.organizationUnitId,
          preferredApproverId,
        },
        tx,
      );
      const created = await this.createWorkflowAndAppendCreationAudit(tx, {
        type: WorkflowType.BOOKING_CORRECTION,
        requesterId: requester.id,
        entityType: 'Booking',
        entityId: booking.id,
        reason: parsed.reason,
        requestPayload: {
          bookingId: parsed.bookingId,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          timeTypeId: parsed.timeTypeId,
        },
        assignment,
        auditAfter: {
          traversedApprovers: assignment.traversedApprovers,
        },
      });

      return { workflow: created, assignment };
    });

    return {
      ...workflow,
      escalated: assignment.escalated,
      traversedApprovers: assignment.traversedApprovers,
    };
  }

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = ShiftSwapRequestSchema.parse(payload);
    assertCanActForPerson(user, requester.id, parsed.fromPersonId);

    const workflow = await this.prisma.$transaction(async (tx) => {
      await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
      const routingShift = await tx.shift.findUnique({
        where: { id: parsed.shiftId },
        select: { rosterId: true },
      });
      if (!routingShift) {
        throw new NotFoundException('Shift not found.');
      }

      await lockRosterWrites(tx, [routingShift.rosterId]);
      await lockPersonWrites(tx, [parsed.fromPersonId, parsed.toPersonId]);
      const [shift, toPerson] = await Promise.all([
        tx.shift.findUnique({
          where: { id: parsed.shiftId },
          include: {
            assignments: true,
            roster: { select: { organizationUnitId: true } },
          },
        }),
        tx.person.findUnique({
          where: { id: parsed.toPersonId },
          select: { id: true, organizationUnitId: true },
        }),
      ]);
      if (!shift) {
        throw new NotFoundException('Shift not found.');
      }
      if (shift.rosterId !== routingShift.rosterId) {
        throw new ConflictException({
          code: 'SHIFT_ROSTER_CHANGED',
          message: 'Shift roster changed; retry the swap request.',
          retryable: true,
        });
      }
      if (!toPerson) {
        throw new NotFoundException('toPersonId person not found.');
      }
      if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
        throw new BadRequestException(
          'toPersonId must belong to the shift roster organization unit.',
        );
      }
      if (!shift.assignments.some((item) => item.personId === parsed.fromPersonId)) {
        throw new BadRequestException('fromPersonId is not assigned to the shift.');
      }
      if (shift.assignments.some((item) => item.personId === parsed.toPersonId)) {
        throw new BadRequestException('toPersonId is already assigned to the shift.');
      }

      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.SHIFT_SWAP,
          requesterId: requester.id,
          requesterOrganizationUnitId: shift.roster.organizationUnitId,
        },
        tx,
      );
      const created = await this.createWorkflowAndAppendCreationAudit(tx, {
        type: WorkflowType.SHIFT_SWAP,
        requesterId: requester.id,
        entityType: 'Shift',
        entityId: shift.id,
        reason: parsed.reason,
        requestPayload: parsed,
        assignment,
        auditAfter: {
          shiftId: shift.id,
          fromPersonId: parsed.fromPersonId,
          toPersonId: parsed.toPersonId,
        },
      });

      return created;
    });

    return workflow;
  }

  async createOvertimeApprovalWorkflow(
    user: AuthenticatedIdentity,
    payload: unknown,
  ): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = OvertimeApprovalRequestSchema.parse(payload);
    assertCanActForPerson(user, requester.id, parsed.personId);

    const start = new Date(parsed.periodStart);
    const end = new Date(parsed.periodEnd);
    if (start > end) {
      throw new BadRequestException('periodStart must be on or before periodEnd.');
    }

    const workflow = await this.prisma.$transaction(async (tx) => {
      await lockPolicyWrites(tx, WORKFLOW_ROUTING_LOCK_SCOPE);
      await lockPersonWrites(tx, [parsed.personId]);
      const [targetPerson, matchingAccount] = await Promise.all([
        tx.person.findUnique({
          where: { id: parsed.personId },
          select: { id: true, organizationUnitId: true, supervisorId: true },
        }),
        tx.timeAccount.findFirst({
          where: {
            personId: parsed.personId,
            periodStart: { lte: start },
            periodEnd: { gte: end },
          },
          select: { id: true },
          orderBy: { periodStart: 'desc' },
        }),
      ]);
      if (!targetPerson) {
        throw new NotFoundException('Person not found.');
      }
      if (!matchingAccount) {
        throw new BadRequestException(
          'No matching time account exists for the requested overtime approval period.',
        );
      }

      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.OVERTIME_APPROVAL,
          requesterId: requester.id,
          requesterOrganizationUnitId: targetPerson.organizationUnitId,
          preferredApproverId: targetPerson.supervisorId ?? undefined,
        },
        tx,
      );
      const created = await this.createWorkflowAndAppendCreationAudit(tx, {
        type: WorkflowType.OVERTIME_APPROVAL,
        requesterId: requester.id,
        entityType: 'TimeAccount',
        entityId: matchingAccount.id,
        reason: parsed.reason,
        requestPayload: parsed,
        assignment,
        auditAfter: {
          personId: parsed.personId,
          timeAccountId: matchingAccount.id,
          overtimeHours: parsed.overtimeHours,
        },
      });

      return created;
    });

    return workflow;
  }
}
