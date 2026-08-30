/** Centralizes roster reads and plan-versus-actual coverage calculations. */
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import {
  buildRosterPlanVsActual,
  type RosterWithPlanShifts,
} from '../../application/roster/plan-vs-actual-coverage.js';

/**
 * Centralizes roster reads and plan-versus-actual coverage calculations so visibility filters stay consistent.
 */
@Injectable()
export class RosterQueryHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async buildPlanVsActualForRoster(roster: RosterWithPlanShifts) {
    return buildRosterPlanVsActual(this.prisma, roster);
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
