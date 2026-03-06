import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TimeTypeCategory, type Prisma } from '@cueq/database';
import { evaluatePlanVsActualCoverage } from '@cueq/core';
import {
  CreateRosterSchema,
  CreateShiftSchema,
  UpdateShiftSchema,
  AssignShiftSchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import { EventOutboxHelper } from '../helpers/event-outbox.helper';
import { HR_LIKE_ROLES } from '../helpers/role-constants';

const ROSTER_DETAIL_INCLUDE = {
  shifts: {
    include: {
      assignments: {
        include: {
          person: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' as const },
  },
} satisfies Prisma.RosterInclude;

@Injectable()
export class RosterDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
  ) {}

  /* ── Private helpers ────────────────────────────────────────── */

  private assertCanWriteRoster(
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    rosterOrganizationUnitId: string,
  ) {
    if (user.role !== Role.SHIFT_PLANNER) {
      throw new ForbiddenException('Only shift planners can modify rosters.');
    }

    if (actorOrganizationUnitId !== rosterOrganizationUnitId) {
      throw new ForbiddenException('Shift planners can only modify rosters in their own unit.');
    }
  }

  private assertCanReadRoster(
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    rosterOrganizationUnitId: string,
  ) {
    if (HR_LIKE_ROLES.has(user.role)) {
      return;
    }

    if (actorOrganizationUnitId !== rosterOrganizationUnitId) {
      throw new ForbiddenException('Roster access is limited to the same organization unit.');
    }
  }

  private assertRosterIsDraft(status: string) {
    if (status !== 'DRAFT') {
      throw new BadRequestException('Roster is not editable unless status is DRAFT.');
    }
  }

  private assertShiftInsideRoster(
    roster: { periodStart: Date; periodEnd: Date },
    start: Date,
    end: Date,
  ) {
    if (start >= end) {
      throw new BadRequestException('Shift startTime must be before endTime.');
    }

    if (start < roster.periodStart || end > roster.periodEnd) {
      throw new BadRequestException('Shift interval must be inside roster period.');
    }
  }

  private assignedPersonIdsForShift(shift: {
    personId: string | null;
    assignments: Array<{ personId: string }>;
  }) {
    const assignmentIds = shift.assignments.map((assignment) => assignment.personId);
    if (shift.personId && !assignmentIds.includes(shift.personId)) {
      assignmentIds.push(shift.personId);
    }
    return assignmentIds;
  }

  private async ensureNoOverlappingAssignedShift(
    personId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
  ) {
    const conflicting = await this.prisma.shiftAssignment.findFirst({
      where: {
        personId,
        shift: {
          id: excludeShiftId ? { not: excludeShiftId } : undefined,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
      include: {
        shift: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!conflicting) {
      return;
    }

    throw new BadRequestException({
      message: 'Person already has an overlapping assigned shift.',
      conflict: {
        shiftId: conflicting.shift.id,
        startTime: conflicting.shift.startTime.toISOString(),
        endTime: conflicting.shift.endTime.toISOString(),
      },
    });
  }

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
        assignedPersonIds: this.assignedPersonIdsForShift(shift),
      })),
      bookings.map((booking) => ({
        personId: booking.personId,
        startTime: booking.startTime.toISOString(),
        endTime: (booking.endTime ?? booking.startTime).toISOString(),
        timeTypeCategory: booking.timeType.category,
      })),
    );
  }

  private async toRosterDetail(roster: {
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
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
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
        assignments: shift.assignments.map((assignment) => ({
          id: assignment.id,
          personId: assignment.personId,
          firstName: assignment.person.firstName,
          lastName: assignment.person.lastName,
        })),
      })),
      members,
    };
  }

  /* ── Public methods ─────────────────────────────────────────── */

  async createRoster(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateRosterSchema.parse(payload);

    this.assertCanWriteRoster(user, actor.organizationUnitId, parsed.organizationUnitId);

    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: parsed.organizationUnitId,
      from: new Date(parsed.periodStart),
      to: new Date(parsed.periodEnd),
      attemptedAction: 'ROSTER_CREATE',
      entityType: 'Roster',
      entityId: `${parsed.organizationUnitId}:${parsed.periodStart}`,
    });

    const periodStart = new Date(parsed.periodStart);
    const periodEnd = new Date(parsed.periodEnd);
    const overlap = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart: { lt: periodEnd },
        periodEnd: { gt: periodStart },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new BadRequestException('A roster already exists for the given overlapping period.');
    }

    const roster = await this.prisma.roster.create({
      data: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart,
        periodEnd,
        status: 'DRAFT',
      },
      include: ROSTER_DETAIL_INCLUDE,
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_CREATED',
      entityType: 'Roster',
      entityId: roster.id,
      after: {
        organizationUnitId: roster.organizationUnitId,
        periodStart: roster.periodStart.toISOString(),
        periodEnd: roster.periodEnd.toISOString(),
        status: roster.status,
      },
    });

    return this.toRosterDetail(roster);
  }

  async rosterById(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: ROSTER_DETAIL_INCLUDE,
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);

    return this.toRosterDetail(roster);
  }

  async createRosterShift(user: AuthenticatedIdentity, rosterId: string, payload: unknown) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateShiftSchema.parse(payload);

    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      select: {
        id: true,
        organizationUnitId: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    this.assertRosterIsDraft(roster.status);

    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    this.assertShiftInsideRoster(roster, startTime, endTime);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: roster.organizationUnitId,
      from: startTime,
      to: endTime,
      attemptedAction: 'SHIFT_CREATE',
      entityType: 'Shift',
      entityId: `${roster.id}:${parsed.startTime}`,
    });

    const shift = await this.prisma.shift.create({
      data: {
        rosterId: roster.id,
        personId: null,
        startTime,
        endTime,
        shiftType: parsed.shiftType,
        minStaffing: parsed.minStaffing,
      },
      include: {
        assignments: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_CREATED',
      entityType: 'Shift',
      entityId: shift.id,
      after: {
        rosterId: shift.rosterId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
      },
    });

    return {
      id: shift.id,
      rosterId: shift.rosterId,
      personId: shift.personId,
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime.toISOString(),
      shiftType: shift.shiftType,
      minStaffing: shift.minStaffing,
      assignments: shift.assignments.map((assignment) => ({
        id: assignment.id,
        personId: assignment.personId,
        firstName: assignment.person.firstName,
        lastName: assignment.person.lastName,
      })),
    };
  }

  async updateRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = UpdateShiftSchema.parse(payload);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: {
            id: true,
            organizationUnitId: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
        assignments: true,
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);

    const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : shift.startTime;
    const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : shift.endTime;
    this.assertShiftInsideRoster(shift.roster, nextStartTime, nextEndTime);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: nextStartTime,
      to: nextEndTime,
      attemptedAction: 'SHIFT_UPDATE',
      entityType: 'Shift',
      entityId: shift.id,
    });

    for (const assignment of shift.assignments) {
      await this.ensureNoOverlappingAssignedShift(
        assignment.personId,
        nextStartTime,
        nextEndTime,
        shift.id,
      );
    }

    const updated = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
        shiftType: parsed.shiftType,
        minStaffing: parsed.minStaffing,
      },
      include: {
        assignments: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_UPDATED',
      entityType: 'Shift',
      entityId: updated.id,
      before: {
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
      },
      after: {
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        shiftType: updated.shiftType,
        minStaffing: updated.minStaffing,
      },
    });

    return {
      id: updated.id,
      rosterId: updated.rosterId,
      personId: updated.personId,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      shiftType: updated.shiftType,
      minStaffing: updated.minStaffing,
      assignments: updated.assignments.map((assignment) => ({
        id: assignment.id,
        personId: assignment.personId,
        firstName: assignment.person.firstName,
        lastName: assignment.person.lastName,
      })),
    };
  }

  async deleteRosterShift(user: AuthenticatedIdentity, rosterId: string, shiftId: string) {
    const actor = await this.personHelper.personForUser(user);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: { organizationUnitId: true, status: true },
        },
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: shift.startTime,
      to: shift.endTime,
      attemptedAction: 'SHIFT_DELETE',
      entityType: 'Shift',
      entityId: shift.id,
    });

    if (shift._count.bookings > 0) {
      throw new BadRequestException('Cannot delete shift with existing bookings.');
    }

    await this.prisma.shiftAssignment.deleteMany({
      where: { shiftId: shift.id },
    });

    await this.prisma.shift.delete({
      where: { id: shift.id },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_DELETED',
      entityType: 'Shift',
      entityId: shift.id,
      before: {
        rosterId,
      },
    });

    return {
      deleted: true,
      shiftId: shift.id,
    };
  }

  async assignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = AssignShiftSchema.parse(payload);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: {
            organizationUnitId: true,
            status: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: shift.startTime,
      to: shift.endTime,
      attemptedAction: 'SHIFT_ASSIGN',
      entityType: 'Shift',
      entityId: shift.id,
    });

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organizationUnitId: true,
      },
    });

    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    if (person.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException('Assigned person must belong to the roster organization unit.');
    }

    await this.ensureNoOverlappingAssignedShift(
      parsed.personId,
      shift.startTime,
      shift.endTime,
      shift.id,
    );

    const exists = await this.prisma.shiftAssignment.findFirst({
      where: {
        shiftId: shift.id,
        personId: parsed.personId,
      },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Person is already assigned to this shift.');
    }

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        personId: parsed.personId,
      },
    });

    if (!shift.personId) {
      await this.prisma.shift.update({
        where: { id: shift.id },
        data: { personId: parsed.personId },
      });
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_ASSIGNED',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      after: {
        shiftId: assignment.shiftId,
        personId: assignment.personId,
      },
    });

    return {
      id: assignment.id,
      shiftId: assignment.shiftId,
      personId: assignment.personId,
      firstName: person.firstName,
      lastName: person.lastName,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  async unassignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    assignmentId: string,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        id: assignmentId,
        shiftId,
        shift: { rosterId },
      },
      include: {
        shift: {
          select: {
            id: true,
            personId: true,
            startTime: true,
            endTime: true,
            roster: {
              select: {
                organizationUnitId: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Shift assignment not found.');
    }

    this.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      assignment.shift.roster.organizationUnitId,
    );
    this.assertRosterIsDraft(assignment.shift.roster.status);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: assignment.shift.roster.organizationUnitId,
      from: assignment.shift.startTime,
      to: assignment.shift.endTime,
      attemptedAction: 'SHIFT_UNASSIGN',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
    });

    await this.prisma.shiftAssignment.delete({
      where: { id: assignment.id },
    });

    if (assignment.shift.personId === assignment.personId) {
      const replacement = await this.prisma.shiftAssignment.findFirst({
        where: { shiftId: assignment.shift.id },
        orderBy: { createdAt: 'asc' },
        select: { personId: true },
      });

      await this.prisma.shift.update({
        where: { id: assignment.shift.id },
        data: {
          personId: replacement?.personId ?? null,
        },
      });
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_UNASSIGNED',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      before: {
        shiftId: assignment.shiftId,
        personId: assignment.personId,
      },
    });

    return {
      deleted: true,
      assignmentId,
    };
  }

  async publishRoster(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
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

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    this.assertRosterIsDraft(roster.status);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: roster.organizationUnitId,
      from: roster.periodStart,
      to: roster.periodEnd,
      attemptedAction: 'ROSTER_PUBLISH',
      entityType: 'Roster',
      entityId: roster.id,
    });

    const shortfalls = roster.shifts
      .map((shift) => {
        const assigned = this.assignedPersonIdsForShift(shift).length;
        const shortfall = Math.max(shift.minStaffing - assigned, 0);
        return {
          shiftId: shift.id,
          required: shift.minStaffing,
          assigned,
          shortfall,
        };
      })
      .filter((entry) => entry.shortfall > 0);

    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: 'Cannot publish roster due to staffing shortfalls.',
        shortfalls,
      });
    }

    const updated = await this.prisma.roster.update({
      where: { id: roster.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_PUBLISHED',
      entityType: 'Roster',
      entityId: updated.id,
      before: {
        status: roster.status,
      },
      after: {
        status: updated.status,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
    };
  }

  async currentRoster(user: AuthenticatedIdentity) {
    const person = await this.personHelper.personForUser(user);
    const now = new Date();

    const roster = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: person.organizationUnitId,
        status: 'PUBLISHED',
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      include: ROSTER_DETAIL_INCLUDE,
    });

    if (!roster) {
      throw new NotFoundException('No current roster found for this organization unit.');
    }

    return this.toRosterDetail(roster);
  }

  async rosterPlanVsActual(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: {
            assignments: {
              select: { personId: true },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);

    const result = await this.buildPlanVsActualForRoster(roster);

    return {
      rosterId: roster.id,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      ...result,
    };
  }
}
