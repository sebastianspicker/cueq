import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Absence,
  AbsenceStatus,
  type AbsenceType,
  type Prisma,
  Role,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import { calculateAbsenceWorkingDays } from '@cueq/core';
import {
  CreateAbsenceSchema,
  type CreateAbsence,
  CreateLeaveAdjustmentSchema,
  LeaveAdjustmentQuerySchema,
  TeamCalendarQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import { HolidayProvider } from '../helpers/holiday.provider';
import { WorkflowRuntimeService } from '../workflow-runtime.service';
import {
  HR_LIKE_ROLES,
  ABSENCE_TYPES_WITH_APPROVAL,
  ABSENCE_TYPES_AUTO_APPROVED,
  assertHrLikeRole,
  assertCanActForPerson,
} from '../helpers/role-constants';
import { LeaveBalanceHelper } from '../helpers/leave-balance.helper';
import { lockPersonWrites } from '../helpers/transaction-lock.helper';
import type { WorkflowAssignmentResult } from '../helpers/workflow-utils';

@Injectable()
export class AbsenceDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(HolidayProvider) private readonly holidayProvider: HolidayProvider,
    @Inject(WorkflowRuntimeService) private readonly workflowRuntimeService: WorkflowRuntimeService,
    @Inject(LeaveBalanceHelper) private readonly leaveBalanceHelper: LeaveBalanceHelper,
  ) {}

  /* ── Public Methods ───────────────────────────────────────── */

  async createAbsence(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateAbsenceSchema.parse(payload);

    assertCanActForPerson(user, actor.id, parsed.personId);

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

    const start = new Date(`${parsed.startDate}T00:00:00.000Z`);
    const end = new Date(`${parsed.endDate}T00:00:00.000Z`);
    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: start,
      to: end,
      attemptedAction: 'ABSENCE_CREATE',
      entityType: 'Absence',
      entityId: `${parsed.personId}:${parsed.startDate}:${parsed.endDate}`,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    const holidayDates = this.holidayProvider.holidayDatesBetween(parsed.startDate, parsed.endDate);
    const daySpan = calculateAbsenceWorkingDays({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      holidayDates,
    });
    if (daySpan <= 0) {
      throw new BadRequestException('Absence range has no applicable working days.');
    }

    const requestedType = parsed.type as AbsenceType;
    const status = ABSENCE_TYPES_AUTO_APPROVED.has(requestedType)
      ? AbsenceStatus.APPROVED
      : AbsenceStatus.REQUESTED;

    const assignment =
      status === AbsenceStatus.REQUESTED && ABSENCE_TYPES_WITH_APPROVAL.has(requestedType)
        ? await this.workflowRuntimeService.buildWorkflowAssignment({
            type: WorkflowType.LEAVE_REQUEST,
            requesterId: targetPerson.id,
            requesterOrganizationUnitId: targetPerson.organizationUnitId,
            preferredApproverId: targetPerson.supervisorId ?? undefined,
          })
        : undefined;

    const absence = await this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: targetPerson.organizationUnitId,
            from: start,
            to: end,
          },
          tx,
        );
        await lockPersonWrites(tx, [parsed.personId]);
        const currentTargetPerson = await tx.person.findUnique({
          where: { id: parsed.personId },
          select: { organizationUnitId: true, supervisorId: true },
        });
        if (!currentTargetPerson) {
          throw new NotFoundException('Person not found.');
        }
        if (
          currentTargetPerson.organizationUnitId !== targetPerson.organizationUnitId ||
          currentTargetPerson.supervisorId !== targetPerson.supervisorId
        ) {
          throw new ConflictException({
            code: 'PERSON_IDENTITY_CHANGED',
            message: 'Person assignment changed; retry the absence request.',
            retryable: true,
          });
        }

        const overlappingAbsence = await tx.absence.findFirst({
          where: {
            personId: parsed.personId,
            status: { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });
        if (overlappingAbsence) {
          throw new ConflictException('Absence overlaps with an existing absence.');
        }

        const absence = await tx.absence.create({
          data: {
            personId: parsed.personId,
            type: parsed.type,
            startDate: start,
            endDate: end,
            days: daySpan,
            status,
            note: parsed.note,
          },
        });

        await this.createAbsenceWorkflow(tx, {
          actorId: actor.id,
          assignment,
          targetPersonId: targetPerson.id,
          absence,
          parsed,
        });

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: status === AbsenceStatus.REQUESTED ? 'ABSENCE_REQUESTED' : 'ABSENCE_RECORDED',
            entityType: 'Absence',
            entityId: absence.id,
            after: {
              personId: absence.personId,
              type: absence.type,
              startDate: absence.startDate.toISOString(),
              endDate: absence.endDate.toISOString(),
              status: absence.status,
            },
          },
          tx,
        );

        return absence;
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

    return absence;
  }

  private async createAbsenceWorkflow(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      assignment: WorkflowAssignmentResult | undefined;
      targetPersonId: string;
      absence: Absence;
      parsed: CreateAbsence;
    },
  ): Promise<void> {
    const { actorId, assignment, targetPersonId, absence, parsed } = input;
    if (!assignment) return;

    const workflow = await tx.workflowInstance.create({
      data: {
        type: WorkflowType.LEAVE_REQUEST,
        status: assignment.status,
        requesterId: targetPersonId,
        approverId: assignment.approverId,
        entityType: 'Absence',
        entityId: absence.id,
        reason: parsed.note,
        requestPayload: {
          type: parsed.type,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'WORKFLOW_CREATED',
        entityType: 'WorkflowInstance',
        entityId: workflow.id,
        after: {
          type: workflow.type,
          status: workflow.status,
          approverId: workflow.approverId,
          entityType: workflow.entityType,
          entityId: workflow.entityId,
          dueAt: workflow.dueAt?.toISOString() ?? null,
          traversedApprovers: assignment.traversedApprovers,
        },
        reason: parsed.note,
      },
      tx,
    );
  }

  async listMyAbsences(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    return this.prisma.absence.findMany({
      where: { personId: person.id },
      orderBy: { startDate: 'asc' },
    });
  }

  async getAbsenceById(user: AuthenticatedIdentity, absenceId: string): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const absence = await this.prisma.absence.findUnique({ where: { id: absenceId } });
    if (!absence) throw new NotFoundException('Absence not found.');
    assertCanActForPerson(user, actor.id, absence.personId);
    return absence;
  }

  async cancelAbsence(user: AuthenticatedIdentity, absenceId: string): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const absence = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!absence) {
      throw new NotFoundException('Absence not found.');
    }

    assertCanActForPerson(user, actor.id, absence.personId);

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: absence.personId },
      select: { organizationUnitId: true },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: absence.startDate,
      to: absence.endDate,
      attemptedAction: 'ABSENCE_CANCEL',
      entityType: 'Absence',
      entityId: absence.id,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    if (absence.status !== AbsenceStatus.REQUESTED && absence.status !== AbsenceStatus.APPROVED) {
      throw new BadRequestException('Only requested or approved absences can be cancelled.');
    }

    return this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: targetPerson.organizationUnitId,
            from: absence.startDate,
            to: absence.endDate,
          },
          tx,
        );
        await lockPersonWrites(tx, [absence.personId]);
        const currentTargetPerson = await tx.person.findUnique({
          where: { id: absence.personId },
          select: { organizationUnitId: true },
        });
        if (!currentTargetPerson) {
          throw new NotFoundException('Person not found.');
        }
        if (currentTargetPerson.organizationUnitId !== targetPerson.organizationUnitId) {
          throw new ConflictException({
            code: 'PERSON_IDENTITY_CHANGED',
            message: 'Person organization assignment changed; retry the absence cancellation.',
            retryable: true,
          });
        }

        const current = await tx.absence.findUnique({ where: { id: absence.id } });
        if (!current) {
          throw new NotFoundException('Absence not found.');
        }
        if (
          current.status !== AbsenceStatus.REQUESTED &&
          current.status !== AbsenceStatus.APPROVED
        ) {
          throw new BadRequestException('Only requested or approved absences can be cancelled.');
        }

        const cancelled = await tx.absence.update({
          where: { id: current.id },
          data: { status: AbsenceStatus.CANCELLED },
        });

        await tx.workflowInstance.updateMany({
          where: {
            type: WorkflowType.LEAVE_REQUEST,
            entityType: 'Absence',
            entityId: current.id,
            status: {
              in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
            },
          },
          data: {
            status: WorkflowStatus.CANCELLED,
            approverId: actor.id,
            decisionReason: 'absence cancelled by requester',
            decidedAt: new Date(),
          },
        });

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: 'ABSENCE_CANCELLED',
            entityType: 'Absence',
            entityId: current.id,
            before: { status: current.status },
            after: { status: cancelled.status },
          },
          tx,
        );

        return cancelled;
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );
  }

  async leaveBalance(user: AuthenticatedIdentity, year?: number, asOfDate?: string) {
    return this.leaveBalanceHelper.leaveBalance(user, year, asOfDate);
  }

  async createLeaveAdjustment(user: AuthenticatedIdentity, payload: unknown) {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateLeaveAdjustmentSchema.parse(payload);

    const person = await this.prisma.person.findUnique({ where: { id: parsed.personId } });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: person.organizationUnitId,
      from: new Date(Date.UTC(parsed.year, 0, 1, 0, 0, 0)),
      to: new Date(Date.UTC(parsed.year, 11, 31, 23, 59, 59)),
      attemptedAction: 'LEAVE_ADJUSTMENT_CREATE',
      entityType: 'LeaveAdjustment',
      entityId: `${parsed.personId}:${parsed.year}`,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    const adjustment = await this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: person.organizationUnitId,
            from: new Date(Date.UTC(parsed.year, 0, 1, 0, 0, 0)),
            to: new Date(Date.UTC(parsed.year, 11, 31, 23, 59, 59)),
          },
          tx,
        );
        await lockPersonWrites(tx, [parsed.personId]);
        const currentPerson = await tx.person.findUnique({
          where: { id: parsed.personId },
          select: { organizationUnitId: true },
        });
        if (!currentPerson) {
          throw new NotFoundException('Person not found.');
        }
        if (currentPerson.organizationUnitId !== person.organizationUnitId) {
          throw new ConflictException({
            code: 'PERSON_IDENTITY_CHANGED',
            message: 'Person organization assignment changed; retry the leave adjustment.',
            retryable: true,
          });
        }

        const adjustment = await tx.leaveAdjustment.create({
          data: {
            personId: parsed.personId,
            year: parsed.year,
            deltaDays: parsed.deltaDays,
            reason: parsed.reason,
            createdBy: actor.id,
          },
        });

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: 'LEAVE_ADJUSTMENT_CREATED',
            entityType: 'LeaveAdjustment',
            entityId: adjustment.id,
            after: {
              personId: adjustment.personId,
              year: adjustment.year,
              deltaDays: Number(adjustment.deltaDays),
            },
            reason: adjustment.reason,
          },
          tx,
        );

        return adjustment;
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

    return {
      ...adjustment,
      deltaDays: Number(adjustment.deltaDays),
    };
  }

  async listLeaveAdjustments(user: AuthenticatedIdentity, query: unknown) {
    assertHrLikeRole(user);
    const parsed = LeaveAdjustmentQuerySchema.parse(query ?? {});

    const adjustments = await this.prisma.leaveAdjustment.findMany({
      where: {
        personId: parsed.personId,
        year: parsed.year,
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });

    return adjustments.map((adjustment) => ({
      ...adjustment,
      deltaDays: Number(adjustment.deltaDays),
    }));
  }

  async teamCalendar(user: AuthenticatedIdentity, start?: string, end?: string) {
    const person = await this.personHelper.personForUser(user);
    const query = TeamCalendarQuerySchema.parse({ start, end });
    const today = new Date();
    const startDate = query.start
      ? new Date(query.start.includes('T') ? query.start : `${query.start}T00:00:00.000Z`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const endDate = query.end
      ? new Date(query.end.includes('T') ? query.end : `${query.end}T23:59:59.999Z`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('start must be on or before end.');
    }

    const isPrivilegedViewer = user.role === Role.TEAM_LEAD || HR_LIKE_ROLES.has(user.role);
    const visibleStatuses = isPrivilegedViewer
      ? [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED]
      : [AbsenceStatus.APPROVED];
    const absences = await this.prisma.absence.findMany({
      where: {
        person: { organizationUnitId: person.organizationUnitId },
        status: { in: visibleStatuses },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { person: true },
      orderBy: { startDate: 'asc' },
    });

    return absences.map((absence) => ({
      id: absence.id,
      personId: absence.personId,
      personName: `${absence.person.firstName} ${absence.person.lastName}`,
      startDate: absence.startDate.toISOString().slice(0, 10),
      endDate: absence.endDate.toISOString().slice(0, 10),
      status: absence.status,
      visibilityStatus: 'ABSENT' as const,
      type: isPrivilegedViewer ? absence.type : undefined,
      note: isPrivilegedViewer ? absence.note : undefined,
    }));
  }
}
