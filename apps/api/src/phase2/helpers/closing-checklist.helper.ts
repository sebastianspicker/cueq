/** Evaluates the deterministic operational checks required before monthly closing. */
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AbsenceStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
  type ClosingStatus,
} from '@cueq/database';
import { evaluateTimeRules, generateClosingChecklist } from '@cueq/core';
import { DEFAULT_MAX_HOURS_RULE, DEFAULT_REST_RULE } from '@cueq/policy';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { Prisma } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { toCoreClosingStatus } from './closing-lock.helper.js';
import { EventOutboxHelper } from './event-outbox.helper.js';
import { PersonHelper } from './person.helper.js';
import { CLOSING_READ_ROLES } from './role-constants.js';
import { closingBalanceAnomalyHours, closingBookingGapMinutes } from './closing-utils.js';
import { buildRosterPlanVsActual, type RosterWithPlanShifts } from './plan-vs-actual.helper.js';
import { TimeThresholdPolicyHelper } from './time-threshold-policy.helper.js';
import { lockClosingPeriodWrites } from './transaction-lock.helper.js';

type ClosingRuleTimeType = 'WORK' | 'DEPLOYMENT' | 'PAUSE';

type ClosingDb = PrismaService | Prisma.TransactionClient;

type ChecklistPeriod = {
  id: string;
  status: ClosingStatus;
  organizationUnitId: string | null;
  periodStart: Date;
  periodEnd: Date;
};

type ChecklistBooking = {
  personId: string;
  startTime: Date;
  endTime: Date | null;
  timeType: { category: TimeTypeCategory };
};

type RuleBooking = { startTime: Date; endTime: Date; timeType: ClosingRuleTimeType };

type ClosingTimeThresholds = { dailyMaxMinutes: number; minRestMinutes: number };

function isClosingRuleTimeType(category: TimeTypeCategory): category is ClosingRuleTimeType {
  return (
    category === TimeTypeCategory.WORK ||
    category === TimeTypeCategory.DEPLOYMENT ||
    category === TimeTypeCategory.PAUSE
  );
}

function isCompletedWorkBooking(booking: ChecklistBooking): boolean {
  return (
    booking.endTime !== null &&
    (booking.timeType.category === TimeTypeCategory.WORK ||
      booking.timeType.category === TimeTypeCategory.DEPLOYMENT)
  );
}

function policyIntervalType(timeType: ClosingRuleTimeType): 'WORK' | 'DEPLOYMENT' | 'PAUSE' {
  if (timeType === TimeTypeCategory.PAUSE) return 'PAUSE';
  return timeType === TimeTypeCategory.DEPLOYMENT ? 'DEPLOYMENT' : 'WORK';
}

/**
 * Evaluates the deterministic pre-close checklist from bookings, policy thresholds, and period state.
 * Results explain why a period may progress; this helper does not mutate the lifecycle itself.
 */
@Injectable()
export class ClosingChecklistHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(TimeThresholdPolicyHelper)
    private readonly timeThresholdPolicyHelper: TimeThresholdPolicyHelper,
  ) {}

  async buildPlanVsActualForRoster(roster: RosterWithPlanShifts, db: ClosingDb = this.prisma) {
    return buildRosterPlanVsActual(db, roster);
  }

  async closingChecklist(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    db: ClosingDb = this.prisma,
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

    const period = await this.findClosingPeriod(db, closingPeriodId);
    this.assertClosingChecklistAccess(user, actor.organizationUnitId, period);
    const metrics = await this.closingChecklistMetrics(db, period);
    const checklist = generateClosingChecklist(metrics);
    await this.emitChecklistViolation(db, period, checklist, emitViolationEvent);

    return {
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      hasErrors: checklist.hasErrors,
      items: checklist.items,
    };
  }

  private async findClosingPeriod(db: ClosingDb, id: string): Promise<ChecklistPeriod> {
    const period = await db.closingPeriod.findUnique({
      where: { id },
      include: { exportRuns: true },
    });
    if (!period) throw new NotFoundException('Closing period not found.');
    return period;
  }

  private assertClosingChecklistAccess(
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    period: ChecklistPeriod,
  ): void {
    if (user.role !== Role.TEAM_LEAD || period.organizationUnitId === actorOrganizationUnitId)
      return;

    throw new ForbiddenException('Team leads can only access closing checklist in their own unit.');
  }

  private async closingChecklistMetrics(db: ClosingDb, period: ChecklistPeriod) {
    const personIds = await this.closingPersonIds(db, period.organizationUnitId);
    const timeThresholds = await this.timeThresholdPolicyHelper.getActiveThresholds();
    const [bookings, approvedAbsences] = await this.closingBookingsAndAbsences(
      db,
      period,
      personIds,
    );
    const bookingMetrics = this.bookingMetrics(
      bookings,
      approvedAbsences,
      personIds.length,
      period.id,
      timeThresholds,
    );
    const [requests, rosterMismatches, balanceAnomalies] = await Promise.all([
      this.openRequestCounts(db, period, personIds),
      this.rosterMismatchCount(db, period),
      this.balanceAnomalyCount(db, period, personIds),
    ]);
    return { ...bookingMetrics, ...requests, rosterMismatches, balanceAnomalies };
  }

  private async closingPersonIds(
    db: ClosingDb,
    organizationUnitId: string | null,
  ): Promise<string[]> {
    const people = await db.person.findMany({
      where: organizationUnitId
        ? { organizationUnitId, role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] } }
        : { role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return people.map((person) => person.id);
  }

  private closingBookingsAndAbsences(
    db: ClosingDb,
    period: ChecklistPeriod,
    personIds: string[],
  ): Promise<[ChecklistBooking[], Array<{ personId: string }>]> {
    if (personIds.length === 0) return Promise.resolve([[], []]);

    return Promise.all([
      db.booking.findMany({
        where: {
          personId: { in: personIds },
          startTime: { lte: period.periodEnd },
          OR: [{ endTime: null }, { endTime: { gte: period.periodStart } }],
        },
        select: {
          personId: true,
          startTime: true,
          endTime: true,
          timeType: { select: { category: true } },
        },
        orderBy: [{ personId: 'asc' }, { startTime: 'asc' }],
      }),
      db.absence.findMany({
        where: {
          personId: { in: personIds },
          status: AbsenceStatus.APPROVED,
          startDate: { lte: period.periodEnd },
          endDate: { gte: period.periodStart },
        },
        select: { personId: true },
      }),
    ]);
  }

  private bookingMetrics(
    bookings: ChecklistBooking[],
    approvedAbsences: Array<{ personId: string }>,
    personCount: number,
    periodId: string,
    timeThresholds: ClosingTimeThresholds,
  ) {
    const coveredPersonIds = new Set([
      ...bookings.filter(isCompletedWorkBooking).map((booking) => booking.personId),
      ...approvedAbsences.map((absence) => absence.personId),
    ]);
    const ruleBookings = this.ruleBookingsByPerson(bookings);
    return {
      missingBookings: Math.max(personCount - coveredPersonIds.size, 0),
      bookingGaps: this.bookingGapCount(ruleBookings),
      ruleViolations: this.ruleViolationCount(bookings, ruleBookings, periodId, timeThresholds),
    };
  }

  private ruleBookingsByPerson(bookings: ChecklistBooking[]): Map<string, RuleBooking[]> {
    const byPerson = new Map<string, RuleBooking[]>();
    for (const booking of bookings) {
      if (!booking.endTime || !isClosingRuleTimeType(booking.timeType.category)) continue;
      const entries = byPerson.get(booking.personId) ?? [];
      entries.push({
        startTime: booking.startTime,
        endTime: booking.endTime,
        timeType: booking.timeType.category,
      });
      byPerson.set(booking.personId, entries);
    }
    return byPerson;
  }

  private bookingGapCount(bookingsByPerson: Map<string, RuleBooking[]>): number {
    let gaps = 0;
    for (const entries of bookingsByPerson.values()) {
      for (let index = 1; index < entries.length; index += 1) {
        const previous = entries[index - 1];
        const current = entries[index];
        if (previous && current && this.isClosingBookingGap(previous, current)) gaps += 1;
      }
    }
    return gaps;
  }

  private isClosingBookingGap(previous: RuleBooking, current: RuleBooking): boolean {
    return (
      (current.startTime.getTime() - previous.endTime.getTime()) / 60000 >
      closingBookingGapMinutes()
    );
  }

  private ruleViolationCount(
    bookings: ChecklistBooking[],
    bookingsByPerson: Map<string, RuleBooking[]>,
    periodId: string,
    timeThresholds: ClosingTimeThresholds,
  ): number {
    let violations = bookings.filter((booking) => booking.endTime === null).length;
    for (const entries of bookingsByPerson.values()) {
      violations += this.policyViolationCount(entries, periodId, timeThresholds);
    }
    return violations;
  }

  private policyViolationCount(
    entries: RuleBooking[],
    periodId: string,
    timeThresholds: ClosingTimeThresholds,
  ): number {
    return evaluateTimeRules(
      {
        week: `closing-${periodId}`,
        targetHours: 0,
        timezone: 'Europe/Berlin',
        intervals: entries.map((entry) => ({
          start: entry.startTime.toISOString(),
          end: entry.endTime.toISOString(),
          type: policyIntervalType(entry.timeType),
        })),
      },
      {
        maxHoursRule: {
          ...DEFAULT_MAX_HOURS_RULE,
          maxDailyHoursExtended: timeThresholds.dailyMaxMinutes / 60,
          maxWeeklyHours: Number.MAX_SAFE_INTEGER,
        },
        restRule: { ...DEFAULT_REST_RULE, minRestHours: timeThresholds.minRestMinutes / 60 },
      },
    ).violations.length;
  }

  private openRequestCounts(db: ClosingDb, period: ChecklistPeriod, personIds: string[]) {
    if (personIds.length === 0)
      return Promise.resolve({ openCorrectionRequests: 0, openLeaveRequests: 0 });

    return Promise.all([
      db.workflowInstance.count({
        where: {
          type: WorkflowType.BOOKING_CORRECTION,
          status: {
            in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
          },
          requesterId: { in: personIds },
          createdAt: { gte: period.periodStart, lte: period.periodEnd },
        },
      }),
      db.absence.count({
        where: {
          personId: { in: personIds },
          status: AbsenceStatus.REQUESTED,
          startDate: { lte: period.periodEnd },
          endDate: { gte: period.periodStart },
        },
      }),
    ]).then(([openCorrectionRequests, openLeaveRequests]) => ({
      openCorrectionRequests,
      openLeaveRequests,
    }));
  }

  private async rosterMismatchCount(db: ClosingDb, period: ChecklistPeriod): Promise<number> {
    const rosters = await db.roster.findMany({
      where: {
        periodStart: { lte: period.periodEnd },
        periodEnd: { gte: period.periodStart },
        organizationUnitId: period.organizationUnitId ?? undefined,
      },
      include: { shifts: { include: { assignments: { select: { personId: true } } } } },
    });
    const coverage = await Promise.all(
      rosters.map((roster) => this.buildPlanVsActualForRoster(roster, db)),
    );
    return coverage.reduce((sum, entry) => sum + entry.mismatchedSlots, 0);
  }

  private balanceAnomalyCount(
    db: ClosingDb,
    period: ChecklistPeriod,
    personIds: string[],
  ): Promise<number> {
    if (personIds.length === 0) return Promise.resolve(0);

    const threshold = closingBalanceAnomalyHours();
    return db.timeAccount.count({
      where: {
        personId: { in: personIds },
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
        OR: [{ balance: { gt: threshold } }, { balance: { lt: -threshold } }],
      },
    });
  }

  private async emitChecklistViolation(
    db: ClosingDb,
    period: ChecklistPeriod,
    checklist: ReturnType<typeof generateClosingChecklist>,
    emitViolationEvent: boolean,
  ): Promise<void> {
    if (!emitViolationEvent || !checklist.hasErrors) return;

    const checklistCodes = checklist.items
      .filter((item) => item.severity === 'ERROR' && item.status === 'OPEN')
      .map((item) => item.code);
    if (checklistCodes.length === 0) return;

    await this.eventOutboxHelper.enqueueDomainEvent(
      {
        eventType: 'violation.detected',
        aggregateType: 'ClosingPeriod',
        aggregateId: period.id,
        payload: {
          checklistCodes,
          periodStart: period.periodStart.toISOString(),
          periodEnd: period.periodEnd.toISOString(),
        },
      },
      db,
    );
  }
}
