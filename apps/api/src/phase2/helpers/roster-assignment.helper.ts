import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AssignShiftSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from './person.helper';
import { AuditHelper } from './audit.helper';
import { ClosingLockHelper } from './closing-lock.helper';
import { RosterShiftHelper } from './roster-shift.helper';

@Injectable()
export class RosterAssignmentHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(RosterShiftHelper) private readonly shiftHelper: RosterShiftHelper,
  ) {}

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
          select: { organizationUnitId: true, status: true },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.shiftHelper.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      shift.roster.organizationUnitId,
    );
    this.shiftHelper.assertRosterIsDraft(shift.roster.status);
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

    await this.shiftHelper.ensureNoOverlappingAssignedShift(
      parsed.personId,
      shift.startTime,
      shift.endTime,
      shift.id,
    );

    const exists = await this.prisma.shiftAssignment.findFirst({
      where: { shiftId: shift.id, personId: parsed.personId },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Person is already assigned to this shift.');
    }

    const assignment = await this.prisma.shiftAssignment.create({
      data: { shiftId: shift.id, personId: parsed.personId },
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
              select: { organizationUnitId: true, status: true },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Shift assignment not found.');
    }

    this.shiftHelper.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      assignment.shift.roster.organizationUnitId,
    );
    this.shiftHelper.assertRosterIsDraft(assignment.shift.roster.status);
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
        data: { personId: replacement?.personId ?? null },
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

    return { deleted: true, assignmentId };
  }
}
