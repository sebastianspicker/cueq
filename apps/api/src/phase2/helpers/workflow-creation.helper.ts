import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role, WorkflowType } from '@cueq/database';
import {
  BookingCorrectionSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from './person.helper';
import { AuditHelper } from './audit.helper';
import { assertCanActForPerson } from './role-constants';
import { WorkflowRuntimeService } from '../workflow-runtime.service';

@Injectable()
export class WorkflowCreationHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = BookingCorrectionSchema.parse(payload);

    const booking = await this.prisma.booking.findUnique({
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

    assertCanActForPerson(user, requester.id, booking.personId);
    const preferredApproverId =
      booking.personId === requester.id
        ? (booking.person.supervisorId ?? requester.supervisorId ?? undefined)
        : undefined;

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.BOOKING_CORRECTION,
      requesterId: requester.id,
      requesterOrganizationUnitId: booking.person.organizationUnitId,
      preferredApproverId,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.BOOKING_CORRECTION,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'Booking',
        entityId: booking.id,
        reason: parsed.reason,
        requestPayload: {
          bookingId: parsed.bookingId,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          timeTypeId: parsed.timeTypeId,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        traversedApprovers: assignment.traversedApprovers,
      },
      reason: parsed.reason,
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

    const shift = await this.prisma.shift.findUnique({
      where: { id: parsed.shiftId },
      include: {
        assignments: true,
        roster: { select: { organizationUnitId: true } },
      },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    const toPerson = await this.prisma.person.findUnique({
      where: { id: parsed.toPersonId },
      select: { id: true, organizationUnitId: true },
    });
    if (!toPerson) {
      throw new NotFoundException('toPersonId person not found.');
    }
    if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }

    const fromAssignment = shift.assignments.find((a) => a.personId === parsed.fromPersonId);
    if (!fromAssignment) {
      throw new BadRequestException('fromPersonId is not assigned to the shift.');
    }
    if (shift.assignments.some((a) => a.personId === parsed.toPersonId)) {
      throw new BadRequestException('toPersonId is already assigned to the shift.');
    }

    const preferredApprover = await this.prisma.person.findFirst({
      where: {
        role: Role.SHIFT_PLANNER,
        organizationUnitId: shift.roster.organizationUnitId,
      },
      select: { id: true },
    });
    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.SHIFT_SWAP,
      requesterId: requester.id,
      requesterOrganizationUnitId: shift.roster.organizationUnitId,
      preferredApproverId: preferredApprover?.id ?? undefined,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.SHIFT_SWAP,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'Shift',
        entityId: shift.id,
        reason: parsed.reason,
        requestPayload: parsed,
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        shiftId: shift.id,
        fromPersonId: parsed.fromPersonId,
        toPersonId: parsed.toPersonId,
      },
      reason: parsed.reason,
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

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true, supervisorId: true },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const matchingAccount = await this.prisma.timeAccount.findFirst({
      where: {
        personId: parsed.personId,
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

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.OVERTIME_APPROVAL,
      requesterId: requester.id,
      requesterOrganizationUnitId: targetPerson.organizationUnitId,
      preferredApproverId: targetPerson.supervisorId ?? undefined,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.OVERTIME_APPROVAL,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'TimeAccount',
        entityId: targetPerson.id,
        reason: parsed.reason,
        requestPayload: parsed,
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        personId: parsed.personId,
        overtimeHours: parsed.overtimeHours,
      },
      reason: parsed.reason,
    });

    return workflow;
  }
}
