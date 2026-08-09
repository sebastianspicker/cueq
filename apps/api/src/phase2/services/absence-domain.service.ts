/** Owns absence, leave-adjustment, approval, and balance operations. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AbsenceStatus, type AbsenceType } from '@cueq/database';
import { calculateAbsenceWorkingDays } from '@cueq/core';
import {
  CreateAbsenceSchema,
  CreateLeaveAdjustmentSchema,
  LeaveAdjustmentQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { AuditHelper } from '../helpers/audit.helper.js';
import { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import { HolidayProvider } from '../helpers/holiday.provider.js';
import { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import {
  ABSENCE_TYPES_WITH_APPROVAL,
  ABSENCE_TYPES_AUTO_APPROVED,
  assertHrLikeRole,
  assertCanActForPerson,
} from '../helpers/role-constants.js';
import { LeaveBalanceHelper } from '../helpers/leave-balance.helper.js';
import { toAbsenceResponse } from './absence-response.mapper.js';
import { writeAbsenceCreation } from './absence-create.writer.js';
import { writeAbsenceCancellation } from './absence-cancel.writer.js';
import { writeLeaveAdjustment } from './absence-leave-adjustment.writer.js';
import {
  mayReadAbsenceDetails,
  teamCalendarDateRange,
  teamCalendarStatuses,
  toTeamCalendarEntry,
} from './absence-calendar.query.js';

/**
 * Owns absence and leave-adjustment mutations, including visibility, approval, closing-lock, and audit rules.
 * Mutating paths serialize person writes so balances and workflow state cannot diverge.
 */
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

    const requiresApproval =
      status === AbsenceStatus.REQUESTED && ABSENCE_TYPES_WITH_APPROVAL.has(requestedType);

    const absence = await this.prisma
      .$transaction((tx) =>
        writeAbsenceCreation(tx, {
          actorId: actor.id,
          parsed,
          targetPerson,
          start,
          end,
          daySpan,
          status,
          requiresApproval,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              { organizationUnitId: targetPerson.organizationUnitId, from: start, to: end },
              transaction,
            ),
          workflowRuntimeService: this.workflowRuntimeService,
          auditHelper: this.auditHelper,
        }),
      )
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

    return toAbsenceResponse(absence);
  }

  async listMyAbsences(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    const absences = await this.prisma.absence.findMany({
      where: { personId: person.id },
      orderBy: { startDate: 'asc' },
    });
    return absences.map(toAbsenceResponse);
  }

  async getAbsenceById(user: AuthenticatedIdentity, absenceId: string): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const absence = await this.prisma.absence.findUnique({ where: { id: absenceId } });
    if (!absence) throw new NotFoundException('Absence not found.');
    assertCanActForPerson(user, actor.id, absence.personId);
    return toAbsenceResponse(absence);
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

    const cancelled = await this.prisma
      .$transaction((tx) =>
        writeAbsenceCancellation(tx, {
          actorId: actor.id,
          absence,
          organizationUnitId: targetPerson.organizationUnitId,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              {
                organizationUnitId: targetPerson.organizationUnitId,
                from: absence.startDate,
                to: absence.endDate,
              },
              transaction,
            ),
          auditHelper: this.auditHelper,
        }),
      )
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );
    return toAbsenceResponse(cancelled);
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
      .$transaction((tx) =>
        writeLeaveAdjustment(tx, {
          actorId: actor.id,
          parsed,
          organizationUnitId: person.organizationUnitId,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              {
                organizationUnitId: person.organizationUnitId,
                from: closingAttempt.from,
                to: closingAttempt.to,
              },
              transaction,
            ),
          auditHelper: this.auditHelper,
        }),
      )
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
    const { startDate, endDate } = teamCalendarDateRange(start, end);
    const canReadAbsenceDetails = mayReadAbsenceDetails(user.role);
    const absences = await this.prisma.absence.findMany({
      where: {
        person: { organizationUnitId: person.organizationUnitId },
        status: { in: teamCalendarStatuses(user.role) },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { person: true },
      orderBy: { startDate: 'asc' },
    });

    return absences.map((absence) => toTeamCalendarEntry(absence, canReadAbsenceDetails));
  }
}
