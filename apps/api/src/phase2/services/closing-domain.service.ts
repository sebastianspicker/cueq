import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbsenceStatus,
  BookingSource,
  ClosingLockSource,
  ClosingStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import {
  applyCutoffLock,
  evaluatePlanVsActualCoverage,
  generateClosingChecklist,
} from '@cueq/core';
import {
  ClosingBookingCorrectionSchema,
  ClosingExportRequestSchema,
  ClosingPeriodMonthQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from '../helpers/audit.helper';
import { ClosingLockHelper, toCoreClosingStatus } from '../helpers/closing-lock.helper';
import { assignedPersonIdsForShift } from '../helpers/roster-utils';
import { EventOutboxHelper } from '../helpers/event-outbox.helper';
import { PersonHelper } from '../helpers/person.helper';
import {
  CLOSING_READ_ROLES,
  EXPORT_DOWNLOAD_ROLES,
  HR_LIKE_ROLES,
} from '../helpers/role-constants';
import { WorkflowRuntimeService } from '../workflow-runtime.service';

/* ── Type Aliases ────────────────────────────────────────── */

type ClosingActorRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
type CoreClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

/* ── Free Functions ──────────────────────────────────────── */

function parseShortOffsetToMinutes(offset: string): number {
  if (offset === 'GMT' || offset === 'UTC') {
    return 0;
  }

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offset);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
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

function mapClosingPeriodResponse(period: {
  id: string;
  organizationUnitId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: ClosingStatus;
  exportRuns: unknown;
  closedAt: Date | null;
  closedById: string | null;
  leadApprovedAt: Date | null;
  leadApprovedById: string | null;
  hrApprovedAt: Date | null;
  hrApprovedById: string | null;
  lockedAt: Date | null;
  lockSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: period.id,
    organizationUnitId: period.organizationUnitId,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    status: toCoreClosingStatus(period.status),
    exportRuns: period.exportRuns,
    closedAt: period.closedAt?.toISOString() ?? null,
    closedById: period.closedById,
    leadApprovedAt: period.leadApprovedAt?.toISOString() ?? null,
    leadApprovedById: period.leadApprovedById,
    hrApprovedAt: period.hrApprovedAt?.toISOString() ?? null,
    hrApprovedById: period.hrApprovedById,
    lockedAt: period.lockedAt?.toISOString() ?? null,
    lockSource: period.lockSource,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

/* ── Service ─────────────────────────────────────────────── */

@Injectable()
export class ClosingDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  /* ── Env-Parsing Helpers ────────────────────────────────── */

  private closingAutoCutoffEnabled(): boolean {
    const raw = (process.env.CLOSING_AUTO_CUTOFF_ENABLED ?? 'true').trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(raw);
  }

  private allowManualReviewStart(): boolean {
    const raw = (process.env.CLOSING_ALLOW_MANUAL_REVIEW_START ?? 'false').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  private closingCutoffDay(): number {
    const parsed = Number(process.env.CLOSING_CUTOFF_DAY ?? '3');
    if (!Number.isFinite(parsed)) {
      return 3;
    }

    return Math.min(28, Math.max(1, Math.trunc(parsed)));
  }

  private closingCutoffHour(): number {
    const parsed = Number(process.env.CLOSING_CUTOFF_HOUR ?? '12');
    if (!Number.isFinite(parsed)) {
      return 12;
    }

    return Math.min(23, Math.max(0, Math.trunc(parsed)));
  }

  private closingTimeZone(): string {
    const candidate = process.env.CLOSING_TIMEZONE?.trim() || 'Europe/Berlin';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return 'Europe/Berlin';
    }
  }

  private closingBookingGapMinutes(): number {
    const parsed = Number(process.env.CLOSING_BOOKING_GAP_MINUTES ?? '240');
    return Number.isFinite(parsed) && parsed >= 30 ? Math.trunc(parsed) : 240;
  }

  private closingBalanceAnomalyHours(): number {
    const parsed = Number(process.env.CLOSING_BALANCE_ANOMALY_HOURS ?? '40');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
  }

  /* ── Date / Timezone Helpers ────────────────────────────── */

  private resolveTimeZoneOffsetMinutes(at: Date, timeZone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const zonePart = formatter.formatToParts(at).find((part) => part.type === 'timeZoneName');
    return parseShortOffsetToMinutes(zonePart?.value ?? 'UTC');
  }

  private zonedDateTimeToUtcDate(input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    timeZone: string;
  }): Date {
    const utcGuess = new Date(
      Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0),
    );
    const offsetMinutes = this.resolveTimeZoneOffsetMinutes(utcGuess, input.timeZone);
    return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
  }

  private cutoffAtForPeriod(period: { periodEnd: Date }): Date {
    const cutoffDay = this.closingCutoffDay();
    const cutoffHour = this.closingCutoffHour();
    const timeZone = this.closingTimeZone();

    const periodYear = period.periodEnd.getUTCFullYear();
    const periodMonth = period.periodEnd.getUTCMonth() + 1;
    let cutoffYear = periodYear;
    let cutoffMonth = periodMonth + 1;
    if (cutoffMonth > 12) {
      cutoffMonth = 1;
      cutoffYear += 1;
    }

    const maxDay = new Date(Date.UTC(cutoffYear, cutoffMonth, 0)).getUTCDate();
    const day = Math.min(cutoffDay, maxDay);

    return this.zonedDateTimeToUtcDate({
      year: cutoffYear,
      month: cutoffMonth,
      day,
      hour: cutoffHour,
      minute: 0,
      timeZone,
    });
  }

  private async resolveSystemActorId(): Promise<string | null> {
    return this.auditHelper.resolveSystemActorId();
  }

  private parseMonthToRange(month: string) {
    const [yearString, monthString] = month.split('-');
    const year = Number(yearString);
    const monthNumber = Number(monthString);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      throw new BadRequestException('Month must be in YYYY-MM format.');
    }

    const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
    return { from, to };
  }

  /* ── Plan vs Actual (shared with roster domain) ─────────── */

  private async buildPlanVsActualForRoster(roster: {
    id: string;
    organizationUnitId: string;
    periodStart: Date;
    periodEnd: Date;
    shifts: Array<{
      id: string;
      personId: string | null;
      startTime: Date;
      endTime: Date;
      shiftType: string;
      minStaffing: number;
      assignments: Array<{ personId: string }>;
    }>;
  }) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        person: { organizationUnitId: roster.organizationUnitId },
        timeType: {
          category: {
            in: [TimeTypeCategory.WORK, TimeTypeCategory.DEPLOYMENT],
          },
        },
        startTime: { lt: roster.periodEnd },
        OR: [
          {
            endTime: { gt: roster.periodStart },
          },
          {
            endTime: null,
            startTime: { gte: roster.periodStart },
          },
        ],
      },
      select: {
        personId: true,
        startTime: true,
        endTime: true,
        timeType: {
          select: {
            category: true,
          },
        },
      },
    });

    return evaluatePlanVsActualCoverage(
      roster.shifts.map((shift) => ({
        shiftId: shift.id,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
        assignedPersonIds: assignedPersonIdsForShift(shift),
      })),
      bookings.map((booking) => ({
        personId: booking.personId,
        startTime: booking.startTime.toISOString(),
        endTime: (booking.endTime ?? booking.startTime).toISOString(),
        timeTypeCategory: booking.timeType.category,
      })),
    );
  }

  /* ── Public Methods ─────────────────────────────────────── */

  async runClosingCutoff(now: Date = new Date()) {
    if (!this.closingAutoCutoffEnabled()) {
      return {
        enabled: false,
        evaluated: 0,
        transitioned: 0,
      };
    }

    const periods = await this.prisma.closingPeriod.findMany({
      where: { status: ClosingStatus.OPEN },
      select: { id: true, periodStart: true, periodEnd: true, organizationUnitId: true },
      orderBy: { periodStart: 'asc' },
    });

    const actorId = await this.resolveSystemActorId();
    let transitioned = 0;

    for (const period of periods) {
      const cutoffAt = this.cutoffAtForPeriod(period);
      if (now < cutoffAt) {
        continue;
      }

      const updated = await this.prisma.closingPeriod.updateMany({
        where: {
          id: period.id,
          status: ClosingStatus.OPEN,
        },
        data: {
          status: ClosingStatus.REVIEW,
          lockedAt: now,
          lockSource: ClosingLockSource.AUTO_CUTOFF,
        },
      });

      if (updated.count === 0) {
        continue;
      }

      transitioned += 1;

      if (actorId) {
        await this.auditHelper.appendAudit({
          actorId,
          action: 'CLOSING_CUTOFF_APPLIED',
          entityType: 'ClosingPeriod',
          entityId: period.id,
          before: { status: 'OPEN' },
          after: {
            status: 'REVIEW',
            lockedAt: now.toISOString(),
            lockSource: 'AUTO_CUTOFF',
            cutoffAt: cutoffAt.toISOString(),
          },
        });
      }
    }

    return {
      enabled: true,
      evaluated: periods.length,
      transitioned,
    };
  }

  async listClosingPeriods(
    user: AuthenticatedIdentity,
    fromMonth?: string,
    toMonth?: string,
    organizationUnitId?: string,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = ClosingPeriodMonthQuerySchema.parse({
      from: fromMonth,
      to: toMonth,
      organizationUnitId,
    });
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    if (
      user.role === Role.TEAM_LEAD &&
      parsed.organizationUnitId &&
      parsed.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    const from = parsed.from
      ? this.parseMonthToRange(parsed.from).from
      : new Date('2026-01-01T00:00:00.000Z');
    const to = parsed.to
      ? this.parseMonthToRange(parsed.to).to
      : new Date('2030-12-31T23:59:59.000Z');
    const targetOuId =
      user.role === Role.TEAM_LEAD ? actor.organizationUnitId : parsed.organizationUnitId;

    const periods = await this.prisma.closingPeriod.findMany({
      where: {
        organizationUnitId: targetOuId,
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      include: {
        exportRuns: {
          orderBy: { exportedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { periodStart: 'desc' },
    });

    return periods.map(mapClosingPeriodResponse);
  }

  async getClosingPeriod(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: { exportRuns: { orderBy: { exportedAt: 'desc' } } },
    });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (user.role === Role.TEAM_LEAD && period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    return mapClosingPeriodResponse(period);
  }

  async startClosingReview(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (!this.allowManualReviewStart()) {
      throw new ForbiddenException(
        'Manual review start is disabled. Enable CLOSING_ALLOW_MANUAL_REVIEW_START for emergency use.',
      );
    }

    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Manual review start is restricted to ADMIN role.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'ADVANCE_TO_REVIEW',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        lockedAt: new Date(),
        lockSource: ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REVIEW_STARTED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        lockSource: updated.lockSource,
        lockedAt: updated.lockedAt?.toISOString() ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async leadApproveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (user.role !== Role.TEAM_LEAD) {
      throw new ForbiddenException('Only TEAM_LEAD can submit lead approval.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (!period.organizationUnitId) {
      throw new BadRequestException('Global closing periods do not require team-lead approval.');
    }
    if (period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException(
        'Team leads can only approve closing periods in their own unit.',
      );
    }
    if (period.status !== ClosingStatus.REVIEW) {
      throw new BadRequestException('Lead approval is only valid while period is in REVIEW.');
    }

    if (period.leadApprovedAt) {
      return {
        ...period,
        status: toCoreClosingStatus(period.status),
      };
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        leadApprovedAt: new Date(),
        leadApprovedById: actor.id,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_LEAD_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: {
        leadApprovedAt: null,
        leadApprovedById: period.leadApprovedById ?? null,
      },
      after: {
        leadApprovedAt: updated.leadApprovedAt?.toISOString() ?? null,
        leadApprovedById: updated.leadApprovedById ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async reopenClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can reopen closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'REOPEN',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        leadApprovedAt: null,
        leadApprovedById: null,
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REOPENED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        leadApprovedAt: null,
        hrApprovedAt: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async closingChecklist(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing checklist details.');
    }

    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: {
        exportRuns: true,
      },
    });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (user.role === Role.TEAM_LEAD && period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException(
        'Team leads can only access closing checklist in their own unit.',
      );
    }

    const personScope = await this.prisma.person.findMany({
      where: period.organizationUnitId
        ? {
            organizationUnitId: period.organizationUnitId,
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          }
        : {
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const personIds = personScope.map((person) => person.id);
    const gapThresholdMinutes = this.closingBookingGapMinutes();
    const balanceThresholdHours = this.closingBalanceAnomalyHours();

    const [bookings, approvedAbsences] = await Promise.all([
      personIds.length === 0
        ? Promise.resolve([])
        : this.prisma.booking.findMany({
            where: {
              personId: { in: personIds },
              startTime: { lte: period.periodEnd },
              OR: [{ endTime: null }, { endTime: { gte: period.periodStart } }],
            },
            select: {
              personId: true,
              startTime: true,
              endTime: true,
            },
            orderBy: [{ personId: 'asc' }, { startTime: 'asc' }],
          }),
      personIds.length === 0
        ? Promise.resolve([])
        : this.prisma.absence.findMany({
            where: {
              personId: { in: personIds },
              status: AbsenceStatus.APPROVED,
              startDate: { lte: period.periodEnd },
              endDate: { gte: period.periodStart },
            },
            select: { personId: true },
          }),
    ]);

    const coveredPersonIds = new Set([
      ...bookings.map((entry) => entry.personId),
      ...approvedAbsences.map((entry) => entry.personId),
    ]);
    const missingBookings = Math.max(personIds.length - coveredPersonIds.size, 0);

    const bookingsByPerson = new Map<string, Array<{ startTime: Date; endTime: Date | null }>>();
    for (const booking of bookings) {
      if (!bookingsByPerson.has(booking.personId)) {
        bookingsByPerson.set(booking.personId, []);
      }
      bookingsByPerson.get(booking.personId)!.push({
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
    }

    let bookingGaps = 0;
    let ruleViolations = 0;
    for (const entries of bookingsByPerson.values()) {
      for (let index = 0; index < entries.length; index += 1) {
        const current = entries[index];
        if (!current || !current.endTime) {
          continue;
        }

        const durationMinutes = (current.endTime.getTime() - current.startTime.getTime()) / 60000;
        if (durationMinutes > 10 * 60) {
          ruleViolations += 1;
        }

        const previous = index > 0 ? entries[index - 1] : null;
        if (previous?.endTime) {
          const gapMinutes = (current.startTime.getTime() - previous.endTime.getTime()) / 60000;
          if (gapMinutes > gapThresholdMinutes) {
            bookingGaps += 1;
          }
          const previousDay = previous.endTime.toISOString().slice(0, 10);
          const currentDay = current.startTime.toISOString().slice(0, 10);
          if (previousDay !== currentDay && gapMinutes >= 0 && gapMinutes < 11 * 60) {
            ruleViolations += 1;
          }
        }
      }
    }

    const openStatuses = [
      WorkflowStatus.SUBMITTED,
      WorkflowStatus.PENDING,
      WorkflowStatus.ESCALATED,
    ];
    const [openCorrectionRequests, openLeaveRequests] = await Promise.all([
      personIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.workflowInstance.count({
            where: {
              type: WorkflowType.BOOKING_CORRECTION,
              status: { in: openStatuses },
              requesterId: { in: personIds },
              createdAt: { gte: period.periodStart, lte: period.periodEnd },
            },
          }),
      personIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.absence.count({
            where: {
              personId: { in: personIds },
              status: AbsenceStatus.REQUESTED,
              startDate: { lte: period.periodEnd },
              endDate: { gte: period.periodStart },
            },
          }),
    ]);

    const rosters = await this.prisma.roster.findMany({
      where: {
        periodStart: { lte: period.periodEnd },
        periodEnd: { gte: period.periodStart },
        organizationUnitId: period.organizationUnitId ?? undefined,
      },
      include: {
        shifts: {
          include: {
            assignments: {
              select: { personId: true },
            },
          },
        },
      },
    });

    const rosterMismatches = (
      await Promise.all(
        rosters.map(async (roster) => {
          const coverage = await this.buildPlanVsActualForRoster(roster);
          return coverage.mismatchedSlots;
        }),
      )
    ).reduce((sum, mismatches) => sum + mismatches, 0);

    const balanceAnomalies =
      personIds.length === 0
        ? 0
        : await this.prisma.timeAccount.count({
            where: {
              personId: { in: personIds },
              periodStart: { gte: period.periodStart },
              periodEnd: { lte: period.periodEnd },
              OR: [
                { balance: { gt: balanceThresholdHours } },
                { balance: { lt: -balanceThresholdHours } },
              ],
            },
          });

    const checklist = generateClosingChecklist({
      missingBookings,
      bookingGaps,
      openCorrectionRequests,
      openLeaveRequests,
      ruleViolations,
      rosterMismatches,
      balanceAnomalies,
    });

    if (checklist.hasErrors) {
      const openErrors = checklist.items
        .filter((item) => item.severity === 'ERROR' && item.status === 'OPEN')
        .map((item) => item.code);
      if (openErrors.length > 0) {
        await this.eventOutboxHelper.enqueueDomainEvent({
          eventType: 'violation.detected',
          aggregateType: 'ClosingPeriod',
          aggregateId: period.id,
          payload: {
            checklistCodes: openErrors,
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
          },
        });
      }
    }

    return {
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      hasErrors: checklist.hasErrors,
      items: checklist.items,
    };
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can approve closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.organizationUnitId && !period.leadApprovedAt) {
      throw new BadRequestException(
        'Team-lead approval is required before HR can finalize this closing period.',
      );
    }

    const checklist = await this.closingChecklist(user, closingPeriodId);
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
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: new Date(),
        hrApprovedById: actor.id,
        closedAt: new Date(),
        closedById: actor.id,
        lockedAt: period.lockedAt ?? new Date(),
        lockSource: period.lockSource ?? ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        hrApprovedAt: updated.hrApprovedAt?.toISOString() ?? null,
        hrApprovedById: updated.hrApprovedById,
      },
    });

    await this.eventOutboxHelper.enqueueDomainEvent({
      eventType: 'closing.completed',
      aggregateType: 'ClosingPeriod',
      aggregateId: updated.id,
      payload: {
        status: toCoreClosingStatus(updated.status),
        organizationUnitId: updated.organizationUnitId,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string, payload?: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can export closing periods.');
    }
    const parsedRequest = ClosingExportRequestSchema.parse(payload ?? {});
    const format = parsedRequest.format ?? 'CSV_V1';

    const actor = await this.personHelper.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const accounts = await this.prisma.timeAccount.findMany({
      where: {
        person: period.organizationUnitId
          ? {
              organizationUnitId: period.organizationUnitId,
            }
          : undefined,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      orderBy: { personId: 'asc' },
    });

    const normalizedRows = accounts.map((account) => ({
      personId: account.personId,
      targetHours: Number(Number(account.targetHours).toFixed(2)),
      actualHours: Number(Number(account.actualHours).toFixed(2)),
      balance: Number(Number(account.balance).toFixed(2)),
    }));

    const header = 'personId,targetHours,actualHours,balance';
    const body = normalizedRows
      .map(
        (row) =>
          `${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
      )
      .join('\n');
    const csv = `${header}\n${body}\n`;
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<payrollExport format="${format}" closingPeriodId="${escapeXml(closingPeriodId)}">`,
      ...normalizedRows.map(
        (row) =>
          `  <row personId="${escapeXml(row.personId)}" targetHours="${row.targetHours.toFixed(2)}" actualHours="${row.actualHours.toFixed(2)}" balance="${row.balance.toFixed(2)}" />`,
      ),
      '</payrollExport>',
      '',
    ].join('\n');
    const artifact = format === 'CSV_V1' ? csv : xml;
    const contentType = format === 'CSV_V1' ? 'text/csv' : 'application/xml';
    const checksum = createHash('sha256').update(artifact).digest('hex');

    const existingRun = await this.prisma.exportRun.findFirst({
      where: {
        closingPeriodId,
        format,
        checksum,
      },
      orderBy: { exportedAt: 'desc' },
    });

    if (existingRun?.artifact) {
      return {
        exportRun: existingRun,
        checksum: existingRun.checksum,
        csv: existingRun.format === 'CSV_V1' ? existingRun.artifact : null,
        artifact: existingRun.artifact,
        contentType: existingRun.contentType ?? contentType,
        rows: normalizedRows,
      };
    }

    if (period.status !== ClosingStatus.EXPORTED) {
      const transition = applyCutoffLock({
        currentStatus: toCoreClosingStatus(period.status),
        action: 'EXPORT',
        actorRole: toClosingActorRole(actor.role),
        checklistHasErrors: false,
      });

      if (transition.violations.length > 0) {
        throw new BadRequestException(transition.violations);
      }

      await this.prisma.closingPeriod.update({
        where: { id: closingPeriodId },
        data: {
          status: toPersistenceClosingStatus(transition.nextStatus),
        },
      });
    }

    const exportRun = await this.prisma.exportRun.create({
      data: {
        closingPeriodId,
        format,
        recordCount: normalizedRows.length,
        checksum,
        artifact,
        contentType,
        exportedById: actor.id,
      },
    });

    await this.auditHelper.appendAudit({
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

    await this.eventOutboxHelper.enqueueDomainEvent({
      eventType: 'export.ready',
      aggregateType: 'ExportRun',
      aggregateId: exportRun.id,
      payload: {
        closingPeriodId,
        format: exportRun.format,
        recordCount: exportRun.recordCount,
        checksum: exportRun.checksum,
      },
    });

    return {
      exportRun,
      checksum,
      csv: format === 'CSV_V1' ? artifact : null,
      artifact,
      contentType,
      rows: normalizedRows,
    };
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });

    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }

    if (!exportRun.artifact || exportRun.format !== 'CSV_V1') {
      throw new BadRequestException('CSV artifact is unavailable for this export run.');
    }

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.csv`,
      csv: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType: exportRun.contentType ?? 'text/csv',
    };
  }

  async getExportRunArtifact(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export artifacts.');
    }

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });
    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }
    if (!exportRun.artifact) {
      throw new BadRequestException('Artifact is unavailable for this export run.');
    }

    const extension = exportRun.format === 'XML_V1' ? 'xml' : 'csv';
    const contentType =
      exportRun.contentType ?? (exportRun.format === 'XML_V1' ? 'application/xml' : 'text/csv');

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.${extension}`,
      artifact: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType,
      format: exportRun.format,
    };
  }

  async postCloseCorrection(user: AuthenticatedIdentity, closingPeriodId: string, reason?: string): Promise<unknown> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can create post-close corrections.');
    }

    const actor = await this.personHelper.personForUser(user);
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

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.POST_CLOSE_CORRECTION,
      requesterId: actor.id,
      requesterOrganizationUnitId: actor.organizationUnitId,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.POST_CLOSE_CORRECTION,
        status: assignment.status,
        requesterId: actor.id,
        approverId: assignment.approverId,
        entityType: 'ClosingPeriod',
        entityId: period.id,
        reason,
        requestPayload: {
          closingPeriodId,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: new Date(),
        lockSource: ClosingLockSource.HR_CORRECTION,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
      },
      reason,
    });

    return workflow;
  }

  async applyPostCloseBookingCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    payload: unknown,
  ) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can apply post-close booking corrections.');
    }

    const actor = await this.personHelper.personForUser(user);
    const parsed = ClosingBookingCorrectionSchema.parse(payload ?? {});
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.status !== ClosingStatus.REVIEW && period.status !== ClosingStatus.EXPORTED) {
      throw new BadRequestException(
        'Post-close booking corrections require a REVIEW or EXPORTED period.',
      );
    }

    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: parsed.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Post-close correction workflow not found.');
    }
    if (
      workflow.type !== WorkflowType.POST_CLOSE_CORRECTION ||
      workflow.status !== WorkflowStatus.APPROVED ||
      workflow.entityType !== 'ClosingPeriod' ||
      workflow.entityId !== closingPeriodId
    ) {
      throw new BadRequestException(
        'workflowId must reference an APPROVED POST_CLOSE_CORRECTION workflow for this period.',
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    if (period.organizationUnitId && person.organizationUnitId !== period.organizationUnitId) {
      throw new BadRequestException(
        'Correction booking person must belong to the closing period organization unit.',
      );
    }

    const timeType = await this.prisma.timeType.findUnique({
      where: { id: parsed.timeTypeId },
      select: { id: true, code: true, category: true },
    });
    if (!timeType) {
      throw new NotFoundException('Time type not found.');
    }

    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException('startTime and endTime must form a valid interval.');
    }
    if (startTime < period.periodStart || endTime > period.periodEnd) {
      throw new BadRequestException(
        'Correction booking interval must be inside the closing period time range.',
      );
    }

    const booking = await this.prisma.booking.create({
      data: {
        personId: parsed.personId,
        timeTypeId: parsed.timeTypeId,
        startTime,
        endTime,
        source: BookingSource.CORRECTION,
        note: parsed.note ?? parsed.reason,
      },
    });

    const durationHours = Number(
      ((endTime.getTime() - startTime.getTime()) / 3_600_000).toFixed(4),
    );
    await this.prisma.timeAccount.updateMany({
      where: {
        personId: parsed.personId,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      data: {
        actualHours: { increment: durationHours },
        balance: { increment: durationHours },
        overtimeHours: { increment: durationHours },
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_APPLIED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        closingPeriodId,
        workflowId: workflow.id,
        personId: booking.personId,
        timeTypeId: booking.timeTypeId,
        timeTypeCode: timeType.code,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        durationHours,
      },
      reason: parsed.reason,
    });

    return {
      id: booking.id,
      closingPeriodId,
      workflowId: workflow.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: timeType.code,
      timeTypeCategory: timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      durationHours,
    };
  }
}
