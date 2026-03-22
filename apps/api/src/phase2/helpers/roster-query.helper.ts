import { Inject, Injectable } from '@nestjs/common';
import { Role, TimeTypeCategory } from '@cueq/database';
import { evaluatePlanVsActualCoverage } from '@cueq/core';
import { PrismaService } from '../../persistence/prisma.service';
import { assignedPersonIdsForShift } from './roster-utils';

@Injectable()
export class RosterQueryHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async buildPlanVsActualForRoster(roster: {
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

  async toRosterDetail(roster: {
    id: string;
    organizationUnitId: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    publishedAt: Date | null;
    shifts: Array<{
      id: string;
      rosterId: string;
      personId: string | null;
      startTime: Date;
      endTime: Date;
      shiftType: string;
      minStaffing: number;
      assignments: Array<{
        id: string;
        personId: string;
        person: { firstName: string; lastName: string };
      }>;
    }>;
  }) {
    const members = await this.prisma.person.findMany({
      where: {
        organizationUnitId: roster.organizationUnitId,
        role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    return {
      id: roster.id,
      organizationUnitId: roster.organizationUnitId,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      status: roster.status,
      publishedAt: roster.publishedAt?.toISOString() ?? null,
      shifts: roster.shifts.map((shift) => ({
        id: shift.id,
        rosterId: shift.rosterId,
        personId: shift.personId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
        assignments: shift.assignments.map((a) => ({
          id: a.id,
          personId: a.personId,
          firstName: a.person.firstName,
          lastName: a.person.lastName,
        })),
      })),
      members,
    };
  }
}
