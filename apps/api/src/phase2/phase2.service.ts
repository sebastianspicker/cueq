import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { BookingSource, ClosingStatus, Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import {
  applyCutoffLock,
  buildAuditEntry,
  calculateLeaveQuota,
  calculateProratedMonthlyTarget,
  comparePlanVsActual,
  evaluateOnCallRestCompliance,
  generateClosingChecklist,
  resolveDelegation,
  shouldEscalate,
  transitionWorkflow,
} from '@cueq/core';
import {
  BookingCorrectionSchema,
  CreateAbsenceSchema,
  CreateBookingSchema,
  CreateOnCallDeploymentSchema,
  WorkflowDecisionSchema,
} from '@cueq/shared';
import { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';

const HR_LIKE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);
const APPROVAL_ROLES = new Set<Role>([Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN]);

const TerminalSyncBatchSchema = z.object({
  terminalId: z.string().min(1),
  sourceFile: z.string().optional(),
  records: z.array(
    z.object({
      personId: z.string().cuid(),
      timeTypeCode: z.string().min(1),
      startTime: z.string().datetime(),
      endTime: z.string().datetime().optional(),
      note: z.string().max(1000).optional(),
    }),
  ),
});

type TerminalSyncBatchInput = z.infer<typeof TerminalSyncBatchSchema>;

type ClosingActorRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
type CoreClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

function toClosingActorRole(role: Role): ClosingActorRole {
  if (role === Role.HR) {
    return 'HR';
  }

  if (role === Role.ADMIN) {
    return 'ADMIN';
  }

  if (role === Role.TEAM_LEAD) {
    return 'TEAM_LEAD';
  }

  return 'EMPLOYEE';
}

function toCoreClosingStatus(status: ClosingStatus): CoreClosingStatus {
  if (status === ClosingStatus.CLOSED) {
    return 'APPROVED';
  }

  return status;
}

function toPersistenceClosingStatus(status: CoreClosingStatus): ClosingStatus {
  if (status === 'APPROVED') {
    return ClosingStatus.CLOSED;
  }

  if (status === 'OPEN') {
    return ClosingStatus.OPEN;
  }

  if (status === 'REVIEW') {
    return ClosingStatus.REVIEW;
  }

  return ClosingStatus.EXPORTED;
}

@Injectable()
export class Phase2Service {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async personForUser(user: AuthenticatedIdentity) {
    const person = await this.prisma.person.findFirst({
      where: {
        OR: [{ id: user.subject }, { externalId: user.subject }, { email: user.email }],
      },
      include: { workTimeModel: true },
    });

    if (!person) {
      throw new NotFoundException('Authenticated person was not found.');
    }

    return person;
  }

  private assertCanActForPerson(
    user: AuthenticatedIdentity,
    actorPersonId: string,
    targetPersonId: string,
  ) {
    if (targetPersonId === actorPersonId) {
      return;
    }

    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Cross-person action is restricted to HR/Admin roles.');
    }
  }

  private async appendAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
    reason?: string;
  }) {
    const draft = buildAuditEntry({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      reason: input.reason,
    });

    await this.prisma.auditEntry.create({
      data: {
        id: draft.id,
        timestamp: new Date(draft.timestamp),
        actorId: draft.actorId,
        action: draft.action,
        entityType: draft.entityType,
        entityId: draft.entityId,
        before: draft.before as Prisma.InputJsonValue,
        after: draft.after as Prisma.InputJsonValue,
        reason: draft.reason ?? undefined,
      },
    });
  }

  async me(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    return {
      id: person.id,
      email: person.email,
      role: person.role,
      organizationUnitId: person.organizationUnitId,
      firstName: person.firstName,
      lastName: person.lastName,
    };
  }

  async dashboard(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);
    const now = new Date();

    const latestTimeAccount = await this.prisma.timeAccount.findFirst({
      where: { personId: person.id },
      orderBy: { periodStart: 'desc' },
    });

    const dailyTarget = Number(
      person.workTimeModel?.dailyTargetHours ?? Number(person.workTimeModel?.weeklyHours ?? 0) / 5,
    );

    return {
      personId: person.id,
      modelName: person.workTimeModel?.name ?? 'N/A',
      todayTargetHours: Number(dailyTarget.toFixed(2)),
      currentBalanceHours: Number((latestTimeAccount?.balance ?? 0).toFixed(2)),
      period: latestTimeAccount
        ? {
            start: latestTimeAccount.periodStart.toISOString(),
            end: latestTimeAccount.periodEnd.toISOString(),
          }
        : null,
      quickActions: ['CLOCK_IN', 'REQUEST_LEAVE'],
      now: now.toISOString(),
    };
  }

  async listMyBookings(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    const bookings = await this.prisma.booking.findMany({
      where: { personId: person.id },
      include: { timeType: true },
      orderBy: { startTime: 'asc' },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: booking.timeType.code,
      timeTypeCategory: booking.timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      shiftId: booking.shiftId,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    }));
  }

  async createBooking(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateBookingSchema.parse(payload);

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    const booking = await this.prisma.booking.create({
      data: {
        personId: parsed.personId,
        timeTypeId: parsed.timeTypeId,
        startTime: new Date(parsed.startTime),
        endTime: parsed.endTime ? new Date(parsed.endTime) : null,
        source: parsed.source as BookingSource,
        note: parsed.note,
        shiftId: parsed.shiftId,
      },
      include: {
        timeType: true,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        personId: booking.personId,
        timeTypeId: booking.timeTypeId,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        source: booking.source,
      },
    });

    return {
      id: booking.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: booking.timeType.code,
      timeTypeCategory: booking.timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      shiftId: booking.shiftId,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  async createAbsence(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateAbsenceSchema.parse(payload);

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    const start = new Date(`${parsed.startDate}T00:00:00.000Z`);
    const end = new Date(`${parsed.endDate}T00:00:00.000Z`);
    const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

    const absence = await this.prisma.absence.create({
      data: {
        personId: parsed.personId,
        type: parsed.type,
        startDate: start,
        endDate: end,
        days: daySpan,
        status: 'REQUESTED',
        note: parsed.note,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ABSENCE_REQUESTED',
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

  async listMyAbsences(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    return this.prisma.absence.findMany({
      where: { personId: person.id },
      orderBy: { startDate: 'asc' },
    });
  }

  async leaveBalance(user: AuthenticatedIdentity, year?: number) {
    const person = await this.personForUser(user);
    const targetYear = year ?? new Date().getUTCFullYear();

    const from = new Date(Date.UTC(targetYear, 0, 1));
    const to = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59));

    const approvedAbsences = await this.prisma.absence.findMany({
      where: {
        personId: person.id,
        status: 'APPROVED',
        startDate: { gte: from },
        endDate: { lte: to },
      },
    });

    const usedDays = approvedAbsences.reduce((sum, absence) => sum + Number(absence.days), 0);

    const calculation = calculateLeaveQuota({
      year: targetYear,
      employmentFraction: 1,
      usedDays,
      carryOverDays: 0,
      asOfDate: `${targetYear}-12-31`,
    });

    return {
      personId: person.id,
      year: targetYear,
      entitlement: calculation.entitlementDays,
      used: Number(usedDays.toFixed(2)),
      remaining: calculation.remainingDays,
      carriedOver: calculation.carriedOverDays,
      forfeited: calculation.forfeitedDays,
    };
  }

  async teamCalendar(user: AuthenticatedIdentity, start?: string, end?: string) {
    const person = await this.personForUser(user);

    const startDate = start ? new Date(start) : new Date(Date.UTC(2026, 2, 1));
    const endDate = end ? new Date(end) : new Date(Date.UTC(2026, 2, 31, 23, 59, 59));

    const absences = await this.prisma.absence.findMany({
      where: {
        person: { organizationUnitId: person.organizationUnitId },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { person: true },
      orderBy: { startDate: 'asc' },
    });

    const maySeeReason = user.role === Role.TEAM_LEAD || HR_LIKE_ROLES.has(user.role);

    return absences.map((absence) => ({
      id: absence.id,
      personId: absence.personId,
      personName: `${absence.person.firstName} ${absence.person.lastName}`,
      startDate: absence.startDate.toISOString().slice(0, 10),
      endDate: absence.endDate.toISOString().slice(0, 10),
      status: 'ABSENT',
      type: maySeeReason ? absence.type : undefined,
      note: maySeeReason ? absence.note : undefined,
    }));
  }

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown) {
    const requester = await this.personForUser(user);
    const parsed = BookingCorrectionSchema.parse(payload);

    const booking = await this.prisma.booking.findUnique({ where: { id: parsed.bookingId } });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    this.assertCanActForPerson(user, requester.id, booking.personId);

    const teamLead = await this.prisma.person.findFirst({
      where: {
        organizationUnitId: requester.organizationUnitId,
        role: Role.TEAM_LEAD,
      },
    });

    const fallbackCandidates = [
      ...(teamLead ? [{ approverId: teamLead.id, isAvailable: true }] : []),
      { approverId: requester.id, isAvailable: false },
    ];

    const delegated = resolveDelegation({
      requesterId: requester.id,
      primaryApproverId: requester.supervisorId ?? teamLead?.id ?? requester.id,
      fallbackChain: fallbackCandidates,
      at: new Date().toISOString(),
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.BOOKING_CORRECTION,
        status: WorkflowStatus.PENDING,
        requesterId: requester.id,
        approverId: delegated.approverId,
        entityType: 'Booking',
        entityId: booking.id,
        reason: parsed.reason,
      },
    });

    await this.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
      },
      reason: parsed.reason,
    });

    return {
      ...workflow,
      escalated: delegated.escalated,
      traversedApprovers: delegated.traversed,
    };
  }

  async workflowInbox(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    const where: Prisma.WorkflowInstanceWhereInput = APPROVAL_ROLES.has(user.role)
      ? user.role === Role.HR || user.role === Role.ADMIN
        ? { status: { in: [WorkflowStatus.PENDING, WorkflowStatus.ESCALATED] } }
        : {
            status: { in: [WorkflowStatus.PENDING, WorkflowStatus.ESCALATED] },
            approverId: person.id,
          }
      : { requesterId: person.id };

    const workflows = await this.prisma.workflowInstance.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return workflows.map((workflow) => ({
      ...workflow,
      shouldEscalate: shouldEscalate({
        currentStatus: workflow.status as
          | 'PENDING'
          | 'APPROVED'
          | 'REJECTED'
          | 'ESCALATED'
          | 'CANCELLED',
        submittedAt: workflow.createdAt.toISOString(),
        now: new Date().toISOString(),
        escalationDeadlineHours: 48,
      }),
    }));
  }

  async decideWorkflow(user: AuthenticatedIdentity, workflowId: string, payload: unknown) {
    const actor = await this.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Only approval-capable roles can decide workflows.');
    }

    const parsed = WorkflowDecisionSchema.parse({
      ...(payload as Record<string, unknown>),
      workflowId,
    });

    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: parsed.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const transition = transitionWorkflow({
      workflowId: workflow.id,
      actorId: actor.id,
      reason: parsed.reason,
      currentStatus: workflow.status,
      decision: parsed.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      at: new Date().toISOString(),
    });

    if (!transition.ok) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.workflowInstance.update({
      where: { id: workflow.id },
      data: {
        status: transition.nextStatus,
        approverId: actor.id,
        decidedAt: new Date(transition.decidedAt),
        reason: parsed.reason ?? workflow.reason,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'WORKFLOW_DECIDED',
      entityType: 'WorkflowInstance',
      entityId: updated.id,
      before: { status: workflow.status, approverId: workflow.approverId },
      after: { status: updated.status, approverId: updated.approverId },
      reason: parsed.reason,
    });

    return updated;
  }

  async currentRoster(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);
    const now = new Date();

    const roster = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: person.organizationUnitId,
        status: 'PUBLISHED',
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      include: { shifts: true },
    });

    if (!roster) {
      throw new NotFoundException('No current roster found for this organization unit.');
    }

    return roster;
  }

  async rosterPlanVsActual(rosterId: string) {
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: {
            bookings: true,
          },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    const slots = roster.shifts.map((shift) => ({
      slotId: shift.id,
      plannedHeadcount: Math.max(shift.minStaffing, shift.personId ? 1 : 0),
      actualHeadcount: shift.bookings.length,
    }));

    const result = comparePlanVsActual(slots);

    return {
      rosterId: roster.id,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      ...result,
    };
  }

  async createOnCallDeployment(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateOnCallDeploymentSchema.parse(payload);

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    const endTime = parsed.endTime
      ? new Date(parsed.endTime)
      : new Date(new Date(parsed.startTime).getTime() + 60 * 60 * 1000);

    const deployment = await this.prisma.onCallDeployment.create({
      data: {
        personId: parsed.personId,
        rotationId: parsed.rotationId,
        startTime: new Date(parsed.startTime),
        endTime,
        remote: parsed.remote,
        ticketReference: parsed.ticketReference,
        eventReference: parsed.eventReference,
        description: parsed.description,
      },
    });

    const deploymentTimeType = await this.prisma.timeType.findFirst({
      where: { code: 'DEPLOYMENT' },
      select: { id: true },
    });

    if (deploymentTimeType) {
      await this.prisma.booking.create({
        data: {
          personId: parsed.personId,
          timeTypeId: deploymentTimeType.id,
          startTime: new Date(parsed.startTime),
          endTime,
          source: BookingSource.MANUAL,
          note: parsed.description,
        },
      });
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_DEPLOYMENT_CREATED',
      entityType: 'OnCallDeployment',
      entityId: deployment.id,
      after: {
        personId: deployment.personId,
        startTime: deployment.startTime.toISOString(),
        endTime: deployment.endTime.toISOString(),
      },
    });

    return deployment;
  }

  async onCallCompliance(user: AuthenticatedIdentity, personId?: string, nextShiftStart?: string) {
    const actor = await this.personForUser(user);
    const targetPersonId = personId ?? actor.id;

    this.assertCanActForPerson(user, actor.id, targetPersonId);

    if (!nextShiftStart) {
      throw new BadRequestException('nextShiftStart query parameter is required.');
    }

    const deployments = await this.prisma.onCallDeployment.findMany({
      where: {
        personId: targetPersonId,
      },
      orderBy: { endTime: 'desc' },
      take: 20,
    });

    const result = evaluateOnCallRestCompliance({
      rotationStart: deployments[deployments.length - 1]?.startTime.toISOString() ?? nextShiftStart,
      rotationEnd: deployments[0]?.endTime.toISOString() ?? nextShiftStart,
      nextShiftStart,
      deployments: deployments.map((deployment) => ({
        start: deployment.startTime.toISOString(),
        end: deployment.endTime.toISOString(),
      })),
    });

    return {
      personId: targetPersonId,
      ...result,
    };
  }

  async closingChecklist(closingPeriodId: string) {
    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: {
        exportRuns: true,
      },
    });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const personsInOu = await this.prisma.person.count({
      where: period.organizationUnitId
        ? {
            organizationUnitId: period.organizationUnitId,
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          }
        : {
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          },
    });

    const [bookedPersonIds, absentPersonIds] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          startTime: { gte: period.periodStart, lte: period.periodEnd },
          person: period.organizationUnitId
            ? {
                organizationUnitId: period.organizationUnitId,
                role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
              }
            : undefined,
        },
        select: { personId: true },
      }),
      this.prisma.absence.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: period.periodEnd },
          endDate: { gte: period.periodStart },
          person: period.organizationUnitId
            ? {
                organizationUnitId: period.organizationUnitId,
                role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
              }
            : undefined,
        },
        select: { personId: true },
      }),
    ]);

    const covered = new Set(
      [...bookedPersonIds, ...absentPersonIds].map((entry) => entry.personId),
    );
    const missingBookings = Math.max(personsInOu - covered.size, 0);

    const openCorrectionRequests = await this.prisma.workflowInstance.count({
      where: {
        type: WorkflowType.BOOKING_CORRECTION,
        status: { in: [WorkflowStatus.PENDING, WorkflowStatus.ESCALATED] },
      },
    });

    const openLeaveRequests = await this.prisma.absence.count({
      where: { status: 'REQUESTED' },
    });

    const rosters = await this.prisma.roster.findMany({
      where: {
        periodStart: { lte: period.periodEnd },
        periodEnd: { gte: period.periodStart },
      },
      include: {
        shifts: {
          include: { bookings: true },
        },
      },
    });

    const rosterMismatches = rosters.reduce((sum, roster) => {
      const slots = roster.shifts.map((shift) => ({
        slotId: shift.id,
        plannedHeadcount: Math.max(shift.minStaffing, shift.personId ? 1 : 0),
        actualHeadcount: shift.bookings.length,
      }));

      return sum + comparePlanVsActual(slots).mismatchedSlots;
    }, 0);

    const balanceAnomalies = await this.prisma.timeAccount.count({
      where: {
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
        OR: [{ balance: { gt: 40 } }, { balance: { lt: -40 } }],
      },
    });

    const checklist = generateClosingChecklist({
      missingBookings,
      bookingGaps: 0,
      openCorrectionRequests,
      openLeaveRequests,
      ruleViolations: 0,
      rosterMismatches,
      balanceAnomalies,
    });

    return {
      closingPeriodId: period.id,
      status: period.status,
      hasErrors: checklist.hasErrors,
      items: checklist.items,
    };
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can approve closing periods.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const checklist = await this.closingChecklist(closingPeriodId);
    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'APPROVE',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: checklist.hasErrors,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: { status: toPersistenceClosingStatus(transition.nextStatus) },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can export closing periods.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'EXPORT',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const accounts = await this.prisma.timeAccount.findMany({
      where: {
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      orderBy: { personId: 'asc' },
    });

    const exportPayload = {
      closingPeriodId,
      generatedAt: new Date().toISOString(),
      accounts: accounts.map((account) => ({
        personId: account.personId,
        targetHours: Number(account.targetHours),
        actualHours: Number(account.actualHours),
        balance: Number(account.balance),
      })),
    };

    const checksum = createHash('sha256').update(JSON.stringify(exportPayload)).digest('hex');

    const exportRun = await this.prisma.exportRun.create({
      data: {
        closingPeriodId,
        format: 'JSON_V0',
        recordCount: exportPayload.accounts.length,
        checksum,
        exportedById: actor.id,
      },
    });

    await this.prisma.closingPeriod.update({
      where: { id: closingPeriodId },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_EXPORTED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        checksum,
        recordCount: exportRun.recordCount,
        format: exportRun.format,
      },
    });

    return {
      exportRun,
      checksum,
      payload: exportPayload,
    };
  }

  async postCloseCorrection(user: AuthenticatedIdentity, closingPeriodId: string, reason?: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can create post-close corrections.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'POST_CLOSE_CORRECTION',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.POST_CLOSE_CORRECTION,
        status: WorkflowStatus.PENDING,
        requesterId: actor.id,
        approverId: actor.id,
        entityType: 'ClosingPeriod',
        entityId: period.id,
        reason,
      },
    });

    await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: { status: toPersistenceClosingStatus(transition.nextStatus) },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      reason,
    });

    return workflow;
  }

  async importTerminalBatch(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }

    const actor = await this.personForUser(user);
    const parsed = TerminalSyncBatchSchema.parse(payload) as TerminalSyncBatchInput;

    const sorted = [...parsed.records].sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
    const seen = new Set<string>();

    let duplicates = 0;
    let created = 0;
    const conflictFlags: Array<{ personId: string; startTime: string; type: 'ABSENCE_CONFLICT' }> =
      [];

    for (const record of sorted) {
      const dedupeKey = `${record.personId}:${record.timeTypeCode}:${record.startTime}:${record.endTime ?? ''}`;
      if (seen.has(dedupeKey)) {
        duplicates += 1;
        continue;
      }

      seen.add(dedupeKey);

      const timeType = await this.prisma.timeType.findFirst({
        where: { code: record.timeTypeCode },
      });
      if (!timeType) {
        continue;
      }

      const bookingStart = new Date(record.startTime);
      const bookingEnd = new Date(record.endTime ?? record.startTime);

      const absenceConflict = await this.prisma.absence.findFirst({
        where: {
          personId: record.personId,
          status: 'APPROVED',
          startDate: { lte: bookingEnd },
          endDate: { gte: bookingStart },
        },
      });

      if (absenceConflict) {
        conflictFlags.push({
          personId: record.personId,
          startTime: record.startTime,
          type: 'ABSENCE_CONFLICT',
        });
      }

      await this.prisma.booking.create({
        data: {
          personId: record.personId,
          timeTypeId: timeType.id,
          startTime: bookingStart,
          endTime: record.endTime ? bookingEnd : null,
          source: BookingSource.IMPORT,
          note: record.note,
        },
      });

      created += 1;
    }

    const batch = await this.prisma.terminalSyncBatch.create({
      data: {
        terminalId: parsed.terminalId,
        sourceFile: parsed.sourceFile,
        importedById: actor.id,
        rawPayload: parsed as Prisma.InputJsonValue,
        resultPayload: {
          totalRecords: parsed.records.length,
          created,
          duplicates,
          conflictFlags,
          sorted: true,
        } as Prisma.InputJsonValue,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'TERMINAL_BATCH_IMPORTED',
      entityType: 'TerminalSyncBatch',
      entityId: batch.id,
      after: {
        terminalId: parsed.terminalId,
        created,
        duplicates,
        conflictFlags,
      },
    });

    return {
      batchId: batch.id,
      terminalId: parsed.terminalId,
      totalRecords: parsed.records.length,
      created,
      duplicates,
      conflictFlags,
      sorted: true,
    };
  }

  async getTerminalBatch(batchId: string) {
    const batch = await this.prisma.terminalSyncBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Terminal batch not found.');
    }

    return batch;
  }

  async computeProratedTarget(payload: {
    month: string;
    actualHours: number;
    transitionAdjustmentHours?: number;
    segments: Array<{ from: string; to: string; weeklyHours: number }>;
  }) {
    return calculateProratedMonthlyTarget(payload);
  }
}
