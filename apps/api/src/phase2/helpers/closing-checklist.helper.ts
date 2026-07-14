import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AbsenceStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import { evaluatePlanVsActualCoverage, generateClosingChecklist } from '@cueq/core';
import { PrismaService } from '../../persistence/prisma.service';
import type { Prisma } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { toCoreClosingStatus } from './closing-lock.helper';
import { EventOutboxHelper } from './event-outbox.helper';
import { PersonHelper } from './person.helper';
import { CLOSING_READ_ROLES } from './role-constants';
import { assignedPersonIdsForShift } from './roster-utils';
import { closingBalanceAnomalyHours, closingBookingGapMinutes } from './closing-utils';
import { TimeThresholdPolicyHelper } from './time-threshold-policy.helper';
import { lockClosingPeriodWrites } from './transaction-lock.helper';

@Injectable()
export class ClosingChecklistHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(TimeThresholdPolicyHelper)
    private readonly timeThresholdPolicyHelper: TimeThresholdPolicyHelper,
  ) {}

  async buildPlanVsActualForRoster(
    roster: {
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
    },
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const bookings = await db.booking.findMany({
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

  async closingChecklist(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
    emitViolationEvent = true,
  ): Promise<{
    closingPeriodId: string;
    status: 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';
    hasErrors: boolean;
    items: ReturnType<typeof generateClosingChecklist>['items'];
  }> {
    const actor = await this.personHelper.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing checklist details.');
    }

    // The read endpoint may emit a violation event. Keep its observations and
    // that write under the same period lock so it cannot race a closure.
    if (db === this.prisma) {
      return this.prisma.$transaction(async (tx) => {
        await lockClosingPeriodWrites(tx, closingPeriodId);
        return this.closingChecklist(user, closingPeriodId, tx, emitViolationEvent);
      });
    }

    const period = await db.closingPeriod.findUnique({
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

    const personScope = await db.person.findMany({
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
    const gapThresholdMinutes = closingBookingGapMinutes();
    const balanceThresholdHours = closingBalanceAnomalyHours();
    const timeThresholds = await this.timeThresholdPolicyHelper.getActiveThresholds();

    // A closing period is complete for a person when it has either work bookings
    // or an approved absence. Requested absences still block closure below.
    const [bookings, approvedAbsences] = await Promise.all([
      personIds.length === 0
        ? Promise.resolve([])
        : db.booking.findMany({
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
        : db.absence.findMany({
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
        if (durationMinutes > timeThresholds.dailyMaxMinutes) {
          ruleViolations += 1;
        }

        const previous = index > 0 ? entries[index - 1] : null;
        if (previous?.endTime) {
          const gapMinutes = (current.startTime.getTime() - previous.endTime.getTime()) / 60000;
          if (gapMinutes > gapThresholdMinutes) {
            bookingGaps += 1;
          }
          // Same-day gaps are booking-completeness warnings. The statutory rest
          // check only applies when the break crosses local German workdays.
          const toLocalDate = (d: Date) =>
            d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
          const previousDay = toLocalDate(previous.endTime);
          const currentDay = toLocalDate(current.startTime);
          if (
            previousDay !== currentDay &&
            gapMinutes > 0 &&
            gapMinutes < timeThresholds.minRestMinutes
          ) {
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
        : db.workflowInstance.count({
            where: {
              type: WorkflowType.BOOKING_CORRECTION,
              status: { in: openStatuses },
              requesterId: { in: personIds },
              createdAt: { gte: period.periodStart, lte: period.periodEnd },
            },
          }),
      personIds.length === 0
        ? Promise.resolve(0)
        : db.absence.count({
            where: {
              personId: { in: personIds },
              status: AbsenceStatus.REQUESTED,
              startDate: { lte: period.periodEnd },
              endDate: { gte: period.periodStart },
            },
          }),
    ]);

    const rosters = await db.roster.findMany({
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
          const coverage = await this.buildPlanVsActualForRoster(roster, db);
          return coverage.mismatchedSlots;
        }),
      )
    ).reduce((sum, mismatches) => sum + mismatches, 0);

    const balanceAnomalies =
      personIds.length === 0
        ? 0
        : await db.timeAccount.count({
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

    if (emitViolationEvent && checklist.hasErrors) {
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
}
