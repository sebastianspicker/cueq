/** Queries transaction-scoped data for deterministic closing-checklist metrics. */
import {
  AbsenceStatus,
  Role,
  WorkflowStatus,
  WorkflowType,
  type ClosingStatus,
} from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { buildRosterPlanVsActual } from './plan-vs-actual.helper.js';
import {
  calculateClosingBookingMetrics,
  type ClosingChecklistBooking,
  type ClosingTimeThresholds,
} from './closing-checklist-rules.js';
import { closingBalanceAnomalyHours } from './closing-utils.js';

export type ClosingDb = Pick<
  PrismaService,
  | 'closingPeriod'
  | 'person'
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
) {
  const personIds = await closingPersonIds(db, period.organizationUnitId);
  const timeThresholds = await getActiveThresholds();
  const [bookings, approvedAbsences] = await closingBookingsAndAbsences(db, period, personIds);
  const bookingMetrics = calculateClosingBookingMetrics(
    bookings,
    approvedAbsences,
    personIds.length,
    period.id,
    timeThresholds,
  );
  const [requests, rosterMismatches, balanceAnomalies] = await Promise.all([
    openRequestCounts(db, period, personIds),
    rosterMismatchCount(db, period),
    balanceAnomalyCount(db, period, personIds),
  ]);
  return { ...bookingMetrics, ...requests, rosterMismatches, balanceAnomalies };
}

async function closingPersonIds(
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

function closingBookingsAndAbsences(
  db: ClosingDb,
  period: ChecklistPeriod,
  personIds: string[],
): Promise<[ClosingChecklistBooking[], Array<{ personId: string }>]> {
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

function openRequestCounts(db: ClosingDb, period: ChecklistPeriod, personIds: string[]) {
  if (personIds.length === 0) {
    return Promise.resolve({ openCorrectionRequests: 0, openLeaveRequests: 0 });
  }

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

async function rosterMismatchCount(db: ClosingDb, period: ChecklistPeriod): Promise<number> {
  const rosters = await db.roster.findMany({
    where: {
      periodStart: { lte: period.periodEnd },
      periodEnd: { gte: period.periodStart },
      organizationUnitId: period.organizationUnitId ?? undefined,
    },
    include: { shifts: { include: { assignments: { select: { personId: true } } } } },
  });
  const coverage = await Promise.all(rosters.map((roster) => buildRosterPlanVsActual(db, roster)));
  return coverage.reduce((sum, entry) => sum + entry.mismatchedSlots, 0);
}

function balanceAnomalyCount(
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
