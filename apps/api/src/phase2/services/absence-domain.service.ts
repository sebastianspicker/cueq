import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbsenceStatus, AbsenceType, Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { calculateAbsenceWorkingDays, calculateLeaveLedger } from '@cueq/core';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import {
  CreateAbsenceSchema,
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

@Injectable()
export class AbsenceDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(HolidayProvider) private readonly holidayProvider: HolidayProvider,
    @Inject(WorkflowRuntimeService) private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  /* ── Private Helpers ──────────────────────────────────────── */

  private defaultAsOfDate(targetYear: number): string {
    const today = new Date();
    const currentYear = today.getUTCFullYear();
    if (targetYear === currentYear) {
      return today.toISOString().slice(0, 10);
    }

    return `${targetYear}-12-31`;
  }

  private computeLeaveEntitlementCarryOver(input: {
    year: number;
    workTimeModelWeeklyHours: number;
    employmentStartDate?: string;
    employmentEndDate?: string;
    usage: Array<{ date: string; days: number }>;
    adjustments: Array<{ year: number; deltaDays: number }>;
    priorYearCarryOverDays?: number;
    asOfDate: string;
  }) {
    return calculateLeaveLedger({
      year: input.year,
      asOfDate: input.asOfDate,
      workTimeModelWeeklyHours: input.workTimeModelWeeklyHours,
      employmentStartDate: input.employmentStartDate,
      employmentEndDate: input.employmentEndDate,
      priorYearCarryOverDays: input.priorYearCarryOverDays ?? 0,
      annualLeaveUsage: input.usage,
      adjustments: input.adjustments,
    });
  }

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
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: start,
      to: end,
      attemptedAction: 'ABSENCE_CREATE',
      entityType: 'Absence',
      entityId: `${parsed.personId}:${parsed.startDate}:${parsed.endDate}`,
    });

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

    const absence = await this.prisma.absence.create({
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

    if (status === AbsenceStatus.REQUESTED && ABSENCE_TYPES_WITH_APPROVAL.has(requestedType)) {
      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
        type: WorkflowType.LEAVE_REQUEST,
        requesterId: targetPerson.id,
        requesterOrganizationUnitId: targetPerson.organizationUnitId,
        preferredApproverId: targetPerson.supervisorId ?? undefined,
      });

      const workflow = await this.prisma.workflowInstance.create({
        data: {
          type: WorkflowType.LEAVE_REQUEST,
          status: assignment.status,
          requesterId: targetPerson.id,
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

      await this.auditHelper.appendAudit({
        actorId: actor.id,
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
      });
    }

    await this.auditHelper.appendAudit({
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
    });

    return absence;
  }

  async listMyAbsences(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    return this.prisma.absence.findMany({
      where: { personId: person.id },
      orderBy: { startDate: 'asc' },
    });
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

    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: absence.startDate,
      to: absence.endDate,
      attemptedAction: 'ABSENCE_CANCEL',
      entityType: 'Absence',
      entityId: absence.id,
    });

    if (absence.status !== AbsenceStatus.REQUESTED && absence.status !== AbsenceStatus.APPROVED) {
      throw new BadRequestException('Only requested or approved absences can be cancelled.');
    }

    const updated = await this.prisma.absence.update({
      where: { id: absence.id },
      data: { status: AbsenceStatus.CANCELLED },
    });

    await this.prisma.workflowInstance.updateMany({
      where: {
        type: WorkflowType.LEAVE_REQUEST,
        entityType: 'Absence',
        entityId: absence.id,
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

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ABSENCE_CANCELLED',
      entityType: 'Absence',
      entityId: absence.id,
      before: { status: absence.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async leaveBalance(user: AuthenticatedIdentity, year?: number, asOfDate?: string) {
    const person = await this.personHelper.personForUser(user);
    const workTimeModel = person.workTimeModelId
      ? await this.prisma.workTimeModel.findUnique({ where: { id: person.workTimeModelId } })
      : null;
    const targetYear = year ?? new Date().getUTCFullYear();
    const resolvedAsOfDate = asOfDate ?? this.defaultAsOfDate(targetYear);
    const asOf = new Date(`${resolvedAsOfDate}T00:00:00.000Z`);
    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestException('Invalid asOfDate.');
    }
    if (asOf.getUTCFullYear() !== targetYear) {
      throw new BadRequestException('asOfDate must be within the requested year.');
    }

    const from = new Date(Date.UTC(targetYear, 0, 1));
    const to = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59));
    const previousYear = targetYear - 1;
    const previousFrom = new Date(Date.UTC(previousYear, 0, 1));
    const previousTo = new Date(Date.UTC(previousYear, 11, 31, 23, 59, 59));

    const [annualLeaveAbsences, priorAnnualLeaveAbsences, adjustments] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { gte: from },
          endDate: { lte: to },
        },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { gte: previousFrom },
          endDate: { lte: previousTo },
        },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.leaveAdjustment.findMany({
        where: {
          personId: person.id,
          year: { in: [previousYear, targetYear] },
        },
      }),
    ]);

    const modelWeeklyHours = Number(
      workTimeModel?.weeklyHours ?? DEFAULT_LEAVE_RULE.fullTimeWeeklyHours,
    );
    const employmentStartDate = person.employmentStartDate?.toISOString().slice(0, 10);
    const employmentEndDate = person.employmentEndDate?.toISOString().slice(0, 10);
    const priorYearLedger = this.computeLeaveEntitlementCarryOver({
      year: previousYear,
      asOfDate: `${previousYear}-12-31`,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: priorAnnualLeaveAbsences.map((absence) => ({
        date: absence.endDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays: 0,
    });
    const priorYearCarryOverDays = Math.max(priorYearLedger.remainingDays, 0);

    const calculation = this.computeLeaveEntitlementCarryOver({
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: annualLeaveAbsences.map((absence) => ({
        date: absence.endDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays,
    });

    return {
      personId: person.id,
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      entitlement: calculation.entitlementDays,
      used: calculation.usedDays,
      remaining: calculation.remainingDays,
      carriedOver: calculation.carriedOverDays,
      carriedOverUsed: calculation.carriedOverUsedDays,
      forfeited: calculation.forfeitedDays,
      adjustments: calculation.adjustmentsDays,
    };
  }

  async createLeaveAdjustment(user: AuthenticatedIdentity, payload: unknown) {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateLeaveAdjustmentSchema.parse(payload);

    const person = await this.prisma.person.findUnique({ where: { id: parsed.personId } });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: person.organizationUnitId,
      from: new Date(Date.UTC(parsed.year, 11, 1, 0, 0, 0)),
      to: new Date(Date.UTC(parsed.year, 11, 31, 23, 59, 59)),
      attemptedAction: 'LEAVE_ADJUSTMENT_CREATE',
      entityType: 'LeaveAdjustment',
      entityId: `${parsed.personId}:${parsed.year}`,
    });

    const adjustment = await this.prisma.leaveAdjustment.create({
      data: {
        personId: parsed.personId,
        year: parsed.year,
        deltaDays: parsed.deltaDays,
        reason: parsed.reason,
        createdBy: actor.id,
      },
    });

    await this.auditHelper.appendAudit({
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
    });

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
