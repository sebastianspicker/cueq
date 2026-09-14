import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
/** Owns absence, leave-adjustment, approval, and balance operations. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AbsenceStatus, type AbsenceType } from '@cueq/database';
import { countAssignmentWorkingDays } from '@cueq/domain';
import {
  CreateAbsenceSchema,
  AbsenceQuerySchema,
  CreateLeaveAdjustmentSchema,
  LeaveAdjustmentQuerySchema,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import {
  WORKFLOW_RUNTIME_PORT,
  type WorkflowRuntimePort,
} from '../../application/ports/workflow-runtime.port.js';
import { AuditHelper } from '../audit/public.js';
import {
  PersonHelper,
  AssignmentHelper,
  ABSENCE_TYPES_WITH_APPROVAL,
  ABSENCE_TYPES_AUTO_APPROVED,
  assertHrLikeRole,
  assertCanActForPerson,
} from '../people/public.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import { LeaveBalanceHelper } from './leave-balance.helper.js';
import { toAbsenceResponse } from './absence-response.mapper.js';
import { writeAbsenceCreation } from './absence-create.writer.js';
import { writeAbsenceCancellation } from './absence-cancel.writer.js';
import { writeLeaveAdjustment } from './absence-leave-adjustment.writer.js';
import {
  mayReadAbsenceDetails,
  absenceBelongsToOrganization,
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
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(WORKFLOW_RUNTIME_PORT) private readonly workflowRuntimeService: WorkflowRuntimePort,
    @Inject(LeaveBalanceHelper) private readonly leaveBalanceHelper: LeaveBalanceHelper,
  ) {}

  async createAbsence(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateAbsenceSchema.parse(payload);

    assertCanActForPerson(user, actor.id, parsed.personId);

    const start = new Date(`${parsed.startDate}T00:00:00.000Z`);
    const end = new Date(`${parsed.endDate}T00:00:00.000Z`);
    const endExclusive = new Date(end.getTime() + 86_400_000);
    const resolved = await this.assignmentHelper.resolveInterval(
      parsed.personId,
      start,
      endExclusive,
      parsed.assignmentId,
    );
    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: resolved.organizationUnitId,
      from: start,
      to: end,
      attemptedAction: 'ABSENCE_CREATE',
      entityType: 'Absence',
      entityId: `${parsed.personId}:${parsed.startDate}:${parsed.endDate}`,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    const daySpan = countAssignmentWorkingDays({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      workingDays: resolved.term.workingDays,
      holidayDates: resolved.term.holidayCalendar.holidayDates,
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
          resolved,
          start,
          end,
          endExclusive,
          daySpan,
          status,
          requiresApproval,
          assignmentHelper: this.assignmentHelper,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              { organizationUnitId: resolved.organizationUnitId, from: start, to: end },
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

  async listMyAbsences(user: AuthenticatedIdentity, query: unknown = {}): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    const parsed = AbsenceQuerySchema.parse(query);
    const assignment = await this.assignmentHelper.selectAssignment(
      person.id,
      parsed.assignmentId,
      undefined,
      parsed.from ? new Date(`${parsed.from}T00:00:00.000Z`) : undefined,
    );
    const absences = await this.prisma.absence.findMany({
      where: {
        personId: person.id,
        assignmentId: assignment.id,
        status: parsed.status,
        startDate: {
          ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
          ...(parsed.to ? { lte: new Date(parsed.to) } : {}),
        },
        AND: [cursorWhere('startDate', parsed.cursor)],
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: parsed.limit + 1,
    });
    return cursorPage(
      absences,
      parsed.limit,
      'startDate',
      (row) => row.startDate,
      toAbsenceResponse,
    );
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

    const resolved = await this.assignmentHelper.resolveInterval(
      absence.personId,
      absence.startDate,
      new Date(absence.endDate.getTime() + 86_400_000),
      absence.assignmentId,
    );

    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: resolved.organizationUnitId,
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
          resolved,
          assignmentHelper: this.assignmentHelper,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              {
                organizationUnitId: resolved.organizationUnitId,
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

  async leaveBalance(
    user: AuthenticatedIdentity,
    year?: number,
    asOfDate?: string,
    assignmentId?: string,
  ) {
    return this.leaveBalanceHelper.leaveBalance(user, year, asOfDate, assignmentId);
  }

  async createLeaveAdjustment(user: AuthenticatedIdentity, payload: unknown) {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateLeaveAdjustmentSchema.parse(payload);

    const assignment = await this.assignmentHelper.selectAssignment(
      parsed.personId,
      parsed.assignmentId,
    );
    const yearStart = new Date(Date.UTC(parsed.year, 0, 1));
    const yearEndExclusive = new Date(Date.UTC(parsed.year + 1, 0, 1));
    const from =
      assignment.employmentStartDate && assignment.employmentStartDate > yearStart
        ? assignment.employmentStartDate
        : yearStart;
    const employmentEndExclusive = assignment.employmentEndDate
      ? new Date(Date.parse(assignment.employmentEndDate.toISOString().slice(0, 10)) + 86_400_000)
      : yearEndExclusive;
    const to =
      employmentEndExclusive < yearEndExclusive ? employmentEndExclusive : yearEndExclusive;
    if (from >= to)
      throw new BadRequestException('Appointment does not overlap the adjustment year.');
    const resolved = await this.assignmentHelper.resolveInterval(
      parsed.personId,
      from,
      to,
      assignment.id,
    );
    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: resolved.organizationUnitId,
      from,
      to: new Date(to.getTime() - 1),
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
          resolved,
          interval: { from, to },
          assignmentHelper: this.assignmentHelper,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              {
                organizationUnitId: resolved.organizationUnitId,
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
    const assignmentId = parsed.personId
      ? (await this.assignmentHelper.selectAssignment(parsed.personId, parsed.assignmentId)).id
      : parsed.assignmentId;

    const adjustments = await this.prisma.leaveAdjustment.findMany({
      where: {
        personId: parsed.personId,
        assignmentId,
        year: parsed.year,
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });

    return adjustments.map((adjustment) => ({
      ...adjustment,
      deltaDays: Number(adjustment.deltaDays),
    }));
  }

  async teamCalendar(
    user: AuthenticatedIdentity,
    query: { assignmentId?: string; start?: string; end?: string },
  ) {
    const person = await this.personHelper.personForUser(user);
    const { startDate, endDate } = teamCalendarDateRange(query.start, query.end);
    const resolved = await this.assignmentHelper.resolveInterval(
      person.id,
      startDate,
      new Date(endDate.getTime() + 1),
      query.assignmentId,
    );
    const canReadAbsenceDetails = mayReadAbsenceDetails(user.role);
    const absences = await this.prisma.absence.findMany({
      where: {
        assignment: {
          terms: {
            some: {
              organizationUnitId: resolved.organizationUnitId,
              AND: [
                { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: endDate } }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: startDate } }] },
              ],
            },
          },
        },
        status: { in: teamCalendarStatuses(user.role) },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { person: true, assignment: { include: { terms: true } } },
      orderBy: { startDate: 'asc' },
    });

    return absences
      .filter((absence) => absenceBelongsToOrganization(absence, resolved.organizationUnitId))
      .map((absence) => toTeamCalendarEntry(absence, canReadAbsenceDetails));
  }
}
