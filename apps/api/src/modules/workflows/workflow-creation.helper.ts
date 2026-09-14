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
import { AssignmentHelper, PersonHelper, assertCanActForPerson } from '../people/public.js';
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
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  private async createWorkflowAndAppendCreationAudit(
    tx: Prisma.TransactionClient,
    input: {
      type: WorkflowType;
      requesterId: string;
      assignmentId: string;
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
        assignmentId: input.assignmentId,
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
        select: { personId: true, assignmentId: true, startTime: true, endTime: true },
      });
      if (!routingBooking) {
        throw new NotFoundException('Booking not found.');
      }

      assertCanActForPerson(user, requester.id, routingBooking.personId);
      if (parsed.assignmentId && parsed.assignmentId !== routingBooking.assignmentId) {
        throw new BadRequestException('Booking correction appointment does not match booking.');
      }
      await lockPersonWrites(tx, [routingBooking.personId]);
      const booking = await tx.booking.findUnique({
        where: { id: parsed.bookingId },
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
      if (booking.assignmentId !== routingBooking.assignmentId) {
        throw new ConflictException({
          code: 'BOOKING_ASSIGNMENT_CHANGED',
          message: 'Booking appointment changed; retry the correction request.',
          retryable: true,
        });
      }

      const startTime = parsed.startTime ? new Date(parsed.startTime) : booking.startTime;
      const endTime = parsed.endTime ? new Date(parsed.endTime) : booking.endTime;
      const resolved = await this.assignmentHelper.resolveInterval(
        booking.personId,
        startTime,
        endTime ?? undefined,
        booking.assignmentId,
        tx,
      );

      const preferredApproverId =
        booking.personId === requester.id ? (resolved.supervisorId ?? undefined) : undefined;
      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.BOOKING_CORRECTION,
          requesterId: requester.id,
          requesterOrganizationUnitId: resolved.organizationUnitId,
          preferredApproverId,
        },
        tx,
      );
      const created = await this.createWorkflowAndAppendCreationAudit(tx, {
        type: WorkflowType.BOOKING_CORRECTION,
        requesterId: requester.id,
        assignmentId: booking.assignmentId,
        entityType: 'Booking',
        entityId: booking.id,
        reason: parsed.reason,
        requestPayload: {
          bookingId: parsed.bookingId,
          assignmentId: booking.assignmentId,
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
      const shift = await tx.shift.findUnique({
        where: { id: parsed.shiftId },
        include: {
          assignments: true,
          roster: { select: { organizationUnitId: true } },
        },
      });
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
      const sourceShiftAssignment = shift.assignments.find(
        (item) => item.personId === parsed.fromPersonId,
      );
      if (!sourceShiftAssignment) {
        throw new BadRequestException('fromPersonId is not assigned to the shift.');
      }
      if (parsed.assignmentId && parsed.assignmentId !== sourceShiftAssignment.assignmentId) {
        throw new BadRequestException('Source appointment does not match the shift assignment.');
      }
      const sourceEmployment = await this.assignmentHelper.resolveInterval(
        parsed.fromPersonId,
        shift.startTime,
        shift.endTime,
        sourceShiftAssignment.assignmentId,
        tx,
      );
      const targetEmployment = await this.assignmentHelper.resolveInterval(
        parsed.toPersonId,
        shift.startTime,
        shift.endTime,
        parsed.toAssignmentId,
        tx,
      );
      if (
        sourceEmployment.organizationUnitId !== shift.roster.organizationUnitId ||
        targetEmployment.organizationUnitId !== shift.roster.organizationUnitId
      ) {
        throw new BadRequestException(
          'Shift-swap appointments must belong to the shift roster organization unit.',
        );
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
        assignmentId: sourceShiftAssignment.assignmentId,
        entityType: 'Shift',
        entityId: shift.id,
        reason: parsed.reason,
        requestPayload: {
          ...parsed,
          assignmentId: sourceShiftAssignment.assignmentId,
          toAssignmentId: targetEmployment.assignment.id,
        },
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
      const resolved = await this.assignmentHelper.resolveInterval(
        parsed.personId,
        start,
        end,
        parsed.assignmentId,
        tx,
      );
      const matchingAccount = await tx.timeAccount.findFirst({
        where: {
          personId: parsed.personId,
          assignmentId: resolved.assignment.id,
          periodStart: { lte: start },
          periodEnd: { gte: end },
        },
        select: { id: true },
        orderBy: { periodStart: 'desc' },
      });
      if (!matchingAccount) {
        throw new BadRequestException(
          'No matching time account exists for the requested overtime approval period.',
        );
      }

      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.OVERTIME_APPROVAL,
          requesterId: requester.id,
          requesterOrganizationUnitId: resolved.organizationUnitId,
          preferredApproverId: resolved.supervisorId ?? undefined,
        },
        tx,
      );
      const created = await this.createWorkflowAndAppendCreationAudit(tx, {
        type: WorkflowType.OVERTIME_APPROVAL,
        requesterId: requester.id,
        assignmentId: resolved.assignment.id,
        entityType: 'TimeAccount',
        entityId: matchingAccount.id,
        reason: parsed.reason,
        requestPayload: { ...parsed, assignmentId: resolved.assignment.id },
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
