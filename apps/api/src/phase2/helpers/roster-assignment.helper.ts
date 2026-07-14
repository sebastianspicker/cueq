import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AssignShiftSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from './person.helper';
import { AuditHelper } from './audit.helper';
import { ClosingLockHelper } from './closing-lock.helper';
import { RosterShiftHelper } from './roster-shift.helper';
import { lockPersonWrites, lockRosterWrites } from './transaction-lock.helper';
import { assignedPersonIdsForShift } from './roster-utils';

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
    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: shift.startTime,
      to: shift.endTime,
      attemptedAction: 'SHIFT_ASSIGN',
      entityType: 'Shift',
      entityId: shift.id,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    const { assignment, person } = await this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: shift.roster.organizationUnitId,
            from: shift.startTime,
            to: shift.endTime,
          },
          tx,
        );
        await lockRosterWrites(tx, [rosterId]);
        await lockPersonWrites(tx, [parsed.personId]);
        const currentShift = await tx.shift.findFirst({
          where: { id: shiftId, rosterId },
          include: {
            roster: { select: { organizationUnitId: true, status: true } },
          },
        });

        if (!currentShift) {
          throw new NotFoundException('Shift not found.');
        }

        this.shiftHelper.assertCanWriteRoster(
          user,
          actor.organizationUnitId,
          currentShift.roster.organizationUnitId,
        );
        this.shiftHelper.assertRosterIsDraft(currentShift.roster.status);

        const assignedPerson = await tx.person.findUnique({
          where: { id: parsed.personId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            organizationUnitId: true,
          },
        });

        if (!assignedPerson) {
          throw new NotFoundException('Person not found.');
        }
        if (assignedPerson.organizationUnitId !== currentShift.roster.organizationUnitId) {
          throw new BadRequestException(
            'Assigned person must belong to the roster organization unit.',
          );
        }

        await this.shiftHelper.ensureNoOverlappingAssignedShift(
          parsed.personId,
          currentShift.startTime,
          currentShift.endTime,
          currentShift.id,
          tx,
        );

        const exists = await tx.shiftAssignment.findFirst({
          where: { shiftId: currentShift.id, personId: parsed.personId },
          select: { id: true },
        });
        if (exists) {
          throw new BadRequestException('Person is already assigned to this shift.');
        }

        const created = await tx.shiftAssignment.create({
          data: { shiftId: currentShift.id, personId: parsed.personId },
        });
        if (!currentShift.personId) {
          await tx.shift.update({
            where: { id: currentShift.id },
            data: { personId: parsed.personId },
          });
        }

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: 'SHIFT_ASSIGNED',
            entityType: 'ShiftAssignment',
            entityId: created.id,
            after: { shiftId: created.shiftId, personId: created.personId },
          },
          tx,
        );

        return { assignment: created, person: assignedPerson };
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

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
    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: assignment.shift.roster.organizationUnitId,
      from: assignment.shift.startTime,
      to: assignment.shift.endTime,
      attemptedAction: 'SHIFT_UNASSIGN',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    await this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: assignment.shift.roster.organizationUnitId,
            from: assignment.shift.startTime,
            to: assignment.shift.endTime,
          },
          tx,
        );
        await lockRosterWrites(tx, [rosterId]);
        const current = await tx.shiftAssignment.findFirst({
          where: { id: assignmentId, shiftId, shift: { rosterId } },
          include: {
            shift: {
              select: {
                id: true,
                personId: true,
                assignments: { select: { personId: true } },
                roster: { select: { organizationUnitId: true, status: true } },
              },
            },
          },
        });

        if (!current) {
          throw new NotFoundException('Shift assignment not found.');
        }
        this.shiftHelper.assertCanWriteRoster(
          user,
          actor.organizationUnitId,
          current.shift.roster.organizationUnitId,
        );
        this.shiftHelper.assertRosterIsDraft(current.shift.roster.status);
        await lockPersonWrites(tx, assignedPersonIdsForShift(current.shift));

        await tx.shiftAssignment.delete({ where: { id: current.id } });
        if (current.shift.personId === current.personId) {
          const replacement = await tx.shiftAssignment.findFirst({
            where: { shiftId: current.shift.id },
            orderBy: { createdAt: 'asc' },
            select: { personId: true },
          });
          await tx.shift.update({
            where: { id: current.shift.id },
            data: { personId: replacement?.personId ?? null },
          });
        }

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: 'SHIFT_UNASSIGNED',
            entityType: 'ShiftAssignment',
            entityId: current.id,
            before: { shiftId: current.shiftId, personId: current.personId },
          },
          tx,
        );
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

    return { deleted: true, assignmentId };
  }
}
