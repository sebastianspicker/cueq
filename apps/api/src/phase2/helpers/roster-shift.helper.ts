import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@cueq/database';
import { CreateShiftSchema, UpdateShiftSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from './person.helper';
import { AuditHelper } from './audit.helper';
import { ClosingLockHelper } from './closing-lock.helper';

const ROSTER_WRITE_ROLES = new Set<Role>([Role.SHIFT_PLANNER, Role.HR, Role.ADMIN]);
const CROSS_UNIT_ROSTER_WRITE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);

@Injectable()
export class RosterShiftHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  assertCanWriteRoster(user: AuthenticatedIdentity, actorOuId: string, rosterOuId: string) {
    if (!ROSTER_WRITE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only shift planners, HR, or admins can modify rosters.');
    }
    if (!CROSS_UNIT_ROSTER_WRITE_ROLES.has(user.role) && actorOuId !== rosterOuId) {
      throw new ForbiddenException('Shift planners can only modify rosters in their own unit.');
    }
  }

  assertRosterIsDraft(status: string) {
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

  async ensureNoOverlappingAssignedShift(
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
          select: { id: true, startTime: true, endTime: true },
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
      assignments: shift.assignments.map((a) => ({
        id: a.id,
        personId: a.personId,
        firstName: a.person.firstName,
        lastName: a.person.lastName,
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
      assignments: updated.assignments.map((a) => ({
        id: a.id,
        personId: a.personId,
        firstName: a.person.firstName,
        lastName: a.person.lastName,
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
      before: { rosterId },
    });

    return { deleted: true, shiftId: shift.id };
  }
}
