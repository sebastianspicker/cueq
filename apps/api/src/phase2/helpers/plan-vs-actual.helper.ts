/** Builds roster plan-versus-actual coverage from one consistent booking projection. */
import { TimeTypeCategory } from '@cueq/database';
import { evaluatePlanVsActualCoverage } from '@cueq/core';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { assignedPersonIdsForShift } from './roster-utils.js';

export type RosterWithPlanShifts = {
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
};

export type PlanVsActualBooking = {
  personId: string;
  startTime: Date;
  endTime: Date | null;
  timeType: { category: TimeTypeCategory };
};

/** Query eligible work bookings through the supplied client and evaluate roster coverage. */
export async function buildRosterPlanVsActual(
  db: Pick<PrismaService, 'booking'>,
  roster: RosterWithPlanShifts,
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
        { endTime: { gt: roster.periodStart } },
        { endTime: null, startTime: { gte: roster.periodStart } },
      ],
    },
    select: {
      personId: true,
      startTime: true,
      endTime: true,
      timeType: { select: { category: true } },
    },
  });

  return buildRosterPlanVsActualFromBookings(roster, bookings);
}

/** Evaluate roster coverage from a caller-provided eligible booking projection. */
export function buildRosterPlanVsActualFromBookings(
  roster: RosterWithPlanShifts,
  bookings: readonly PlanVsActualBooking[],
) {
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
