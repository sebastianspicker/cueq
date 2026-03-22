import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbsenceStatus, Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import {
  BookingCorrectionSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
  WorkflowDecisionCommandSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
  CreateWorkflowDelegationRuleSchema,
  UpdateWorkflowDelegationRuleSchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { WorkflowRuntimeService } from '../workflow-runtime.service';
import { HR_LIKE_ROLES, assertHrLikeRole, assertCanActForPerson } from '../helpers/role-constants';

@Injectable()
export class WorkflowsDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  /* ── Booking Correction ──────────────────────────────────────── */

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = BookingCorrectionSchema.parse(payload);

    const booking = await this.prisma.booking.findUnique({
      where: { id: parsed.bookingId },
      include: {
        person: {
          select: {
            id: true,
            organizationUnitId: true,
            supervisorId: true,
          },
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

  /* ── Shift Swap ──────────────────────────────────────────────── */

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const requester = await this.personHelper.personForUser(user);
    const parsed = ShiftSwapRequestSchema.parse(payload);
    assertCanActForPerson(user, requester.id, parsed.fromPersonId);

    const shift = await this.prisma.shift.findUnique({
      where: { id: parsed.shiftId },
      include: {
        assignments: true,
        roster: {
          select: {
            organizationUnitId: true,
          },
        },
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

    const fromAssignment = shift.assignments.find(
      (assignment) => assignment.personId === parsed.fromPersonId,
    );
    if (!fromAssignment) {
      throw new BadRequestException('fromPersonId is not assigned to the shift.');
    }
    if (shift.assignments.some((assignment) => assignment.personId === parsed.toPersonId)) {
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

  /* ── Overtime Approval ───────────────────────────────────────── */

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
      select: {
        id: true,
        organizationUnitId: true,
        supervisorId: true,
      },
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

  async upsertWorkflowPolicy(
    user: AuthenticatedIdentity,
    type: string,
    payload: unknown,
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type);
    const parsedPayload = WorkflowPolicyUpsertSchema.parse(payload);
    return this.workflowRuntimeService.upsertPolicy(parsedType as WorkflowType, parsedPayload);
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

  /* ── Workflow Decision (cross-domain side effects) ───────────── */

  // TODO: consider event-based decoupling
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

    /* ── Pre-approval validations ─────────────────────────────── */

    if (requestedAction === 'APPROVE') {
      const workflowForPrecheck = await this.prisma.workflowInstance.findUnique({
        where: { id: workflowId },
        select: {
          id: true,
          type: true,
          entityType: true,
          entityId: true,
          requestPayload: true,
        },
      });
      if (!workflowForPrecheck) {
        throw new NotFoundException('Workflow not found.');
      }

      if (
        workflowForPrecheck.type === WorkflowType.SHIFT_SWAP &&
        workflowForPrecheck.entityType === 'Shift'
      ) {
        const requestPayload = ShiftSwapRequestSchema.parse(
          workflowForPrecheck.requestPayload ?? {},
        );
        const shiftId = requestPayload.shiftId || workflowForPrecheck.entityId;
        const shift = await this.prisma.shift.findUnique({
          where: { id: shiftId },
          include: {
            assignments: true,
            roster: {
              select: {
                organizationUnitId: true,
              },
            },
          },
        });
        if (!shift) {
          throw new NotFoundException('Shift not found for approved swap.');
        }

        const toPerson = await this.prisma.person.findUnique({
          where: { id: requestPayload.toPersonId },
          select: { id: true, organizationUnitId: true },
        });
        if (!toPerson) {
          throw new NotFoundException('toPersonId person no longer exists.');
        }
        if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
          throw new BadRequestException(
            'toPersonId must belong to the shift roster organization unit.',
          );
        }

        const fromAssigned = shift.assignments.some(
          (assignment) => assignment.personId === requestPayload.fromPersonId,
        );
        if (!fromAssigned) {
          throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
        }

        const toAssigned = shift.assignments.some(
          (assignment) => assignment.personId === requestPayload.toPersonId,
        );
        if (toAssigned) {
          throw new BadRequestException('toPersonId assignment already exists on shift.');
        }
      }

      if (
        workflowForPrecheck.type === WorkflowType.OVERTIME_APPROVAL &&
        workflowForPrecheck.entityType === 'TimeAccount'
      ) {
        const requestPayload = OvertimeApprovalRequestSchema.parse(
          workflowForPrecheck.requestPayload ?? {},
        );
        const periodStart = new Date(requestPayload.periodStart);
        const periodEnd = new Date(requestPayload.periodEnd);
        const account = await this.prisma.timeAccount.findFirst({
          where: {
            personId: requestPayload.personId,
            periodStart: { lte: periodStart },
            periodEnd: { gte: periodEnd },
          },
          select: { id: true },
          orderBy: { periodStart: 'desc' },
        });
        if (!account) {
          throw new BadRequestException('No matching time account found for overtime approval.');
        }
      }
    }

    /* ── Execute the workflow state transition ─────────────────── */

    const decision = await this.workflowRuntimeService.decide(
      {
        id: actor.id,
        role: user.role,
        organizationUnitId: actor.organizationUnitId,
      },
      parsed,
    );

    /* ── Side effect: Leave request => Absence status ─────────── */

    if (
      decision.updated.type === WorkflowType.LEAVE_REQUEST &&
      decision.updated.entityType === 'Absence'
    ) {
      const nextAbsenceStatus =
        decision.action === 'APPROVE'
          ? AbsenceStatus.APPROVED
          : decision.action === 'REJECT'
            ? AbsenceStatus.REJECTED
            : decision.action === 'CANCEL'
              ? AbsenceStatus.CANCELLED
              : null;

      if (nextAbsenceStatus) {
        const currentAbsence = await this.prisma.absence.findUnique({
          where: { id: decision.updated.entityId },
          select: { status: true },
        });
        const result = await this.prisma.absence.updateMany({
          where: {
            id: decision.updated.entityId,
            status:
              nextAbsenceStatus === AbsenceStatus.CANCELLED
                ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
                : AbsenceStatus.REQUESTED,
          },
          data: {
            status: nextAbsenceStatus,
          },
        });

        if (result.count > 0) {
          await this.auditHelper.appendAudit({
            actorId: actor.id,
            action:
              nextAbsenceStatus === AbsenceStatus.APPROVED
                ? 'ABSENCE_APPROVED'
                : nextAbsenceStatus === AbsenceStatus.REJECTED
                  ? 'ABSENCE_REJECTED'
                  : 'ABSENCE_CANCELLED',
            entityType: 'Absence',
            entityId: decision.updated.entityId,
            before: {
              status: currentAbsence?.status ?? null,
            },
            after: {
              status: nextAbsenceStatus,
            },
            reason: parsed.reason,
          });
        }
      }
    }

    /* ── Side effect: Shift swap => reassign shift ─────────────── */

    if (
      decision.updated.type === WorkflowType.SHIFT_SWAP &&
      decision.updated.entityType === 'Shift' &&
      decision.action === 'APPROVE'
    ) {
      const swapPayload = ShiftSwapRequestSchema.parse(decision.updated.requestPayload ?? {});
      const shiftId = swapPayload.shiftId || decision.updated.entityId;
      await this.prisma.$transaction(async (tx) => {
        const shift = await tx.shift.findUnique({
          where: { id: shiftId },
          include: {
            assignments: true,
            roster: {
              select: {
                organizationUnitId: true,
              },
            },
          },
        });
        if (!shift) {
          throw new NotFoundException('Shift not found for approved swap.');
        }
        const toPerson = await tx.person.findUnique({
          where: { id: swapPayload.toPersonId },
          select: { id: true, organizationUnitId: true },
        });
        if (!toPerson) {
          throw new NotFoundException('toPersonId person no longer exists.');
        }
        if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
          throw new BadRequestException(
            'toPersonId must belong to the shift roster organization unit.',
          );
        }
        const fromAssignment = shift.assignments.find(
          (assignment) => assignment.personId === swapPayload.fromPersonId,
        );
        if (!fromAssignment) {
          throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
        }
        const toAssigned = shift.assignments.some(
          (assignment) => assignment.personId === swapPayload.toPersonId,
        );
        if (toAssigned) {
          throw new BadRequestException('toPersonId assignment already exists on shift.');
        }
        await tx.shiftAssignment.delete({ where: { id: fromAssignment.id } });
        await tx.shiftAssignment.create({
          data: {
            shiftId: shift.id,
            personId: swapPayload.toPersonId,
          },
        });
      });

      await this.auditHelper.appendAudit({
        actorId: actor.id,
        action: 'SHIFT_SWAP_APPLIED',
        entityType: 'Shift',
        entityId: decision.updated.entityId,
        after: {
          fromPersonId: swapPayload.fromPersonId,
          toPersonId: swapPayload.toPersonId,
          workflowId: decision.updated.id,
        },
        reason: parsed.reason,
      });
    }

    /* ── Side effect: Overtime approval => credit time account ─── */

    if (
      decision.updated.type === WorkflowType.OVERTIME_APPROVAL &&
      decision.updated.entityType === 'TimeAccount' &&
      decision.action === 'APPROVE'
    ) {
      const otPayload = OvertimeApprovalRequestSchema.parse(decision.updated.requestPayload ?? {});
      const periodStart = new Date(otPayload.periodStart);
      const periodEnd = new Date(otPayload.periodEnd);

      const account = await this.prisma.timeAccount.findFirst({
        where: {
          personId: otPayload.personId,
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodEnd },
        },
        orderBy: { periodStart: 'desc' },
      });
      if (!account) {
        throw new NotFoundException('No matching time account found for overtime approval.');
      }

      const nextOvertimeHours =
        Number(Number(account.overtimeHours).toFixed(2)) + otPayload.overtimeHours;
      const updated = await this.prisma.timeAccount.update({
        where: { id: account.id },
        data: {
          overtimeHours: Number(nextOvertimeHours.toFixed(2)),
        },
      });

      await this.auditHelper.appendAudit({
        actorId: actor.id,
        action: 'OVERTIME_APPROVED',
        entityType: 'TimeAccount',
        entityId: updated.id,
        before: {
          overtimeHours: Number(account.overtimeHours),
        },
        after: {
          overtimeHours: Number(updated.overtimeHours),
          workflowId: decision.updated.id,
        },
        reason: parsed.reason,
      });
    }

    return decision.updated;
  }
}
