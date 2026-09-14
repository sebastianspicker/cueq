/** Queries transaction-scoped data for deterministic closing-checklist metrics. */
import {
  AbsenceStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
  type ClosingStatus,
} from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import {
  buildRosterPlanVsActualFromBookings,
  type PlanVsActualBooking,
  type RosterWithPlanShifts,
} from '../../application/roster/plan-vs-actual-coverage.js';
import {
  calculateClosingBookingMetrics,
  type ClosingChecklistBooking,
  type ClosingTimeThresholds,
} from './closing-checklist-rules.js';
import { closingBalanceAnomalyHours } from './closing-config.js';
import type { AssignmentHelper } from '../people/public.js';
import type { TimeAccountsPort } from '../attendance/public.js';

export type ClosingDb = Pick<
  PrismaService,
  | '$queryRaw'
  | 'closingPeriod'
  | 'employmentAssignment'
  | 'employmentTerm'
  | 'booking'
  | 'absence'
  | 'workflowInstance'
  | 'roster'
  | 'timeAccount'
  | 'domainEventOutbox'
>;

export type ChecklistPeriod = {
  id: string;
  status: ClosingStatus;
  organizationUnitId: string | null;
  periodStart: Date;
  periodEnd: Date;
};

export async function calculateClosingChecklistMetrics(
  db: ClosingDb,
  period: ChecklistPeriod,
  getActiveThresholds: () => Promise<ClosingTimeThresholds>,
  assignmentHelper: Pick<AssignmentHelper, 'resolveInterval'>,
  timeAccounts: Pick<TimeAccountsPort, 'countMissingForClosing'>,
) {
  const [population, timeThresholds] = await Promise.all([
    closingPopulation(db, period),
    getActiveThresholds(),
  ]);
  const { ruleBookings, coverageBookings, approvedAbsences } = await closingBookingsAndAbsences(
    db,
    period,
    population,
    assignmentHelper,
  );
  const bookingMetrics = calculateClosingBookingMetrics(
    ruleBookings,
    coverageBookings,
    approvedAbsences,
    population.assignmentIds.length,
    period.id,
    timeThresholds,
  );
  const [requests, rosterMismatches, balanceAnomalies, missingTimeAccounts] = await Promise.all([
    openRequestCounts(db, period, population.assignmentIds, assignmentHelper),
    rosterMismatchCount(db, period, assignmentHelper),
    balanceAnomalyCount(db, period, population.assignmentIds),
    timeAccounts.countMissingForClosing(db, period),
  ]);
  return {
    ...bookingMetrics,
    ...requests,
    rosterMismatches,
    balanceAnomalies,
    missingTimeAccounts,
  };
}

type ClosingPopulation = { personIds: string[]; assignmentIds: string[] };

async function closingPopulation(
  db: ClosingDb,
  period: ChecklistPeriod,
): Promise<ClosingPopulation> {
  const assignments = await db.employmentAssignment.findMany({
    where: {
      person: { role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] } },
      AND: [
        { OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: period.periodEnd } }] },
        { OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: period.periodStart } }] },
      ],
      terms: {
        some: {
          organizationUnitId: period.organizationUnitId ?? undefined,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: period.periodEnd } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodStart } }] },
          ],
        },
      },
    },
    select: { id: true, personId: true },
    orderBy: [{ personId: 'asc' }, { id: 'asc' }],
  });
  return {
    assignmentIds: assignments.map((assignment) => assignment.id),
    personIds: [...new Set(assignments.map((assignment) => assignment.personId))],
  };
}

async function closingBookingsAndAbsences(
  db: ClosingDb,
  period: ChecklistPeriod,
  population: ClosingPopulation,
  assignmentHelper: Pick<AssignmentHelper, 'resolveInterval'>,
): Promise<{
  ruleBookings: ClosingChecklistBooking[];
  coverageBookings: ClosingChecklistBooking[];
  approvedAbsences: Array<{ assignmentId: string }>;
}> {
  if (population.personIds.length === 0) {
    return { ruleBookings: [], coverageBookings: [], approvedAbsences: [] };
  }

  const [ruleBookings, absences] = await Promise.all([
    db.booking.findMany({
      where: {
        personId: { in: population.personIds },
        startTime: { lte: period.periodEnd },
        OR: [{ endTime: null }, { endTime: { gte: period.periodStart } }],
      },
      select: {
        personId: true,
        assignmentId: true,
        startTime: true,
        endTime: true,
        timeType: { select: { category: true } },
      },
      orderBy: [{ personId: 'asc' }, { startTime: 'asc' }],
    }),
    db.absence.findMany({
      where: {
        assignmentId: { in: population.assignmentIds },
        status: AbsenceStatus.APPROVED,
        startDate: { lte: period.periodEnd },
        endDate: { gte: period.periodStart },
      },
      select: { personId: true, assignmentId: true, startDate: true, endDate: true },
      orderBy: [{ personId: 'asc' }, { assignmentId: 'asc' }, { startDate: 'asc' }],
    }),
  ]);

  const assignmentIds = new Set(population.assignmentIds);
  const coverageBookings: ClosingChecklistBooking[] = [];
  for (const booking of ruleBookings) {
    if (!booking.endTime || !assignmentIds.has(booking.assignmentId)) continue;
    const employment = await assignmentHelper.resolveInterval(
      booking.personId,
      booking.startTime,
      booking.endTime,
      booking.assignmentId,
      db,
    );
    if (!period.organizationUnitId || employment.organizationUnitId === period.organizationUnitId) {
      coverageBookings.push(booking);
    }
  }

  const approvedAbsences: Array<{ assignmentId: string }> = [];
  for (const absence of absences) {
    const employment = await assignmentHelper.resolveInterval(
      absence.personId,
      absence.startDate,
      new Date(absence.endDate.getTime() + 86_400_000),
      absence.assignmentId,
      db,
    );
    if (!period.organizationUnitId || employment.organizationUnitId === period.organizationUnitId) {
      approvedAbsences.push({ assignmentId: absence.assignmentId });
    }
  }

  return { ruleBookings, coverageBookings, approvedAbsences };
}

async function openRequestCounts(
  db: ClosingDb,
  period: ChecklistPeriod,
  assignmentIds: string[],
  assignmentHelper: Pick<AssignmentHelper, 'resolveInterval'>,
) {
  if (assignmentIds.length === 0) {
    return Promise.resolve({ openCorrectionRequests: 0, openLeaveRequests: 0 });
  }

  const [openCorrectionRequests, requestedAbsences] = await Promise.all([
    db.workflowInstance.count({
      where: {
        type: WorkflowType.BOOKING_CORRECTION,
        status: {
          in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
        },
        assignmentId: { in: assignmentIds },
        createdAt: { gte: period.periodStart, lte: period.periodEnd },
      },
    }),
    db.absence.findMany({
      where: {
        assignmentId: { in: assignmentIds },
        status: AbsenceStatus.REQUESTED,
        startDate: { lte: period.periodEnd },
        endDate: { gte: period.periodStart },
      },
      select: { personId: true, assignmentId: true, startDate: true, endDate: true },
    }),
  ]);
  let openLeaveRequests = 0;
  for (const absence of requestedAbsences) {
    const employment = await assignmentHelper.resolveInterval(
      absence.personId,
      absence.startDate,
      new Date(absence.endDate.getTime() + 86_400_000),
      absence.assignmentId,
      db,
    );
    if (!period.organizationUnitId || employment.organizationUnitId === period.organizationUnitId) {
      openLeaveRequests += 1;
    }
  }
  return { openCorrectionRequests, openLeaveRequests };
}

async function rosterMismatchCount(
  db: ClosingDb,
  period: ChecklistPeriod,
  assignmentHelper: Pick<AssignmentHelper, 'resolveInterval'>,
): Promise<number> {
  const rosters = await db.roster.findMany({
    where: {
      periodStart: { lte: period.periodEnd },
      periodEnd: { gte: period.periodStart },
      organizationUnitId: period.organizationUnitId ?? undefined,
    },
    include: { shifts: { include: { assignments: { select: { personId: true } } } } },
  });
  if (rosters.length === 0) return 0;

  const organizationUnitIds = [...new Set(rosters.map((roster) => roster.organizationUnitId))];
  const earliestRosterStart = new Date(
    Math.min(...rosters.map((roster) => roster.periodStart.getTime())),
  );
  const latestRosterEnd = new Date(
    Math.max(...rosters.map((roster) => roster.periodEnd.getTime())),
  );

  const bookings = await db.booking.findMany({
    where: {
      assignment: {
        terms: {
          some: {
            organizationUnitId: { in: organizationUnitIds },
            AND: [
              { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: latestRosterEnd } }] },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gt: earliestRosterStart } }] },
            ],
          },
        },
      },
      timeType: {
        category: {
          in: [TimeTypeCategory.WORK, TimeTypeCategory.DEPLOYMENT],
        },
      },
      startTime: { lt: latestRosterEnd },
      OR: [
        { endTime: { gt: earliestRosterStart } },
        { endTime: null, startTime: { gte: earliestRosterStart } },
      ],
    },
    select: {
      personId: true,
      assignmentId: true,
      startTime: true,
      endTime: true,
      timeType: { select: { category: true } },
    },
  });
  const bookingsByOrganizationUnit = new Map<string, PlanVsActualBooking[]>();
  for (const booking of bookings) {
    if (!booking.endTime) continue;
    const employment = await assignmentHelper.resolveInterval(
      booking.personId,
      booking.startTime,
      booking.endTime,
      booking.assignmentId,
      db,
    );
    const organizationBookings =
      bookingsByOrganizationUnit.get(employment.organizationUnitId) ?? [];
    organizationBookings.push(booking);
    bookingsByOrganizationUnit.set(employment.organizationUnitId, organizationBookings);
  }
  const coverage = rosters.map((roster) =>
    buildRosterPlanVsActualFromBookings(
      roster,
      (bookingsByOrganizationUnit.get(roster.organizationUnitId) ?? []).filter((booking) =>
        overlapsRosterPeriod(booking, roster),
      ),
    ),
  );
  return coverage.reduce((sum, entry) => sum + entry.mismatchedSlots, 0);
}

function overlapsRosterPeriod(booking: PlanVsActualBooking, roster: RosterWithPlanShifts): boolean {
  return (
    booking.startTime < roster.periodEnd &&
    (booking.endTime
      ? booking.endTime > roster.periodStart
      : booking.startTime >= roster.periodStart)
  );
}

function balanceAnomalyCount(
  db: ClosingDb,
  period: ChecklistPeriod,
  assignmentIds: string[],
): Promise<number> {
  if (assignmentIds.length === 0) return Promise.resolve(0);

  const threshold = closingBalanceAnomalyHours();
  return db.timeAccount.count({
    where: {
      assignmentId: { in: assignmentIds },
      periodStart: { gte: period.periodStart },
      periodEnd: { lte: period.periodEnd },
      OR: [{ balance: { gt: threshold } }, { balance: { lt: -threshold } }],
    },
  });
}
