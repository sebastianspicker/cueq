/** Performs transactional roster-shift create, update, and delete workflows. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Person, Shift, ShiftAssignment } from '@cueq/database';
import { CreateShiftSchema, UpdateShiftSchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import {
  lockPersonWrites,
  lockRosterWrites,
} from '../../platform/transactions/transaction-lock.helper.js';

type ShiftWithAssignmentPeople = Shift & {
  assignments: Array<ShiftAssignment & { person: Pick<Person, 'firstName' | 'lastName'> }>;
};

type RosterShiftMutationDependencies = {
  prisma: PrismaService;
  personForUser: (
    user: AuthenticatedIdentity,
  ) => Promise<{ id: string; organizationUnitId: string }>;
  appendAudit: AuditHelper['appendAudit'];
  closingLockHelper: Pick<
    ClosingLockHelper,
    | 'assertClosingPeriodUnlockedForRange'
    | 'assertClosingPeriodUnlockedForRangeInTransaction'
    | 'rethrowWithDurableClosingAudit'
  >;
  assertCanWriteRoster: (
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    rosterOrganizationUnitId: string,
  ) => void;
  assertRosterIsDraft: (status: string) => void;
  assertShiftInsideRoster: (
    roster: { periodStart: Date; periodEnd: Date },
    start: Date,
    end: Date,
  ) => void;
  assertClosingGuardIsCurrent: (
    guarded: { organizationUnitId: string | null; from: Date; to: Date },
    current: { organizationUnitId: string | null; from: Date; to: Date },
  ) => void;
  ensureNoOverlappingAssignedShift: (
    personId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId: string | undefined,
    db: Pick<PrismaService, 'shiftAssignment'>,
  ) => Promise<void>;
};

function toRosterShiftDto(shift: ShiftWithAssignmentPeople) {
  return {
    id: shift.id,
    rosterId: shift.rosterId,
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

export async function createRosterShiftMutation(
  dependencies: RosterShiftMutationDependencies,
  user: AuthenticatedIdentity,
  rosterId: string,
  payload: unknown,
) {
  const actor = await dependencies.personForUser(user);
  const parsed = CreateShiftSchema.parse(payload);

  const roster = await dependencies.prisma.roster.findUnique({
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

  dependencies.assertCanWriteRoster(user, actor.organizationUnitId, roster.organizationUnitId);
  dependencies.assertRosterIsDraft(roster.status);

  const startTime = new Date(parsed.startTime);
  const endTime = new Date(parsed.endTime);
  dependencies.assertShiftInsideRoster(roster, startTime, endTime);
  const closingAttempt = {
    actorId: actor.id,
    organizationUnitId: roster.organizationUnitId,
    from: startTime,
    to: endTime,
    attemptedAction: 'SHIFT_CREATE',
    entityType: 'Shift',
    entityId: `${roster.id}:${parsed.startTime}`,
  };
  await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

  const shift = await dependencies.prisma
    .$transaction(async (tx) => {
      await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
        {
          organizationUnitId: roster.organizationUnitId,
          from: startTime,
          to: endTime,
        },
        tx,
      );
      await lockRosterWrites(tx, [rosterId]);
      const currentRoster = await tx.roster.findUnique({
        where: { id: rosterId },
        select: {
          id: true,
          organizationUnitId: true,
          periodStart: true,
          periodEnd: true,
          status: true,
        },
      });

      if (!currentRoster) {
        throw new NotFoundException('Roster not found.');
      }

      dependencies.assertCanWriteRoster(
        user,
        actor.organizationUnitId,
        currentRoster.organizationUnitId,
      );
      dependencies.assertRosterIsDraft(currentRoster.status);
      dependencies.assertShiftInsideRoster(currentRoster, startTime, endTime);

      const created = await tx.shift.create({
        data: {
          rosterId: currentRoster.id,
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

      await dependencies.appendAudit(
        {
          actorId: actor.id,
          action: 'SHIFT_CREATED',
          entityType: 'Shift',
          entityId: created.id,
          after: {
            rosterId: created.rosterId,
            startTime: created.startTime.toISOString(),
            endTime: created.endTime.toISOString(),
            shiftType: created.shiftType,
            minStaffing: created.minStaffing,
          },
        },
        tx,
      );

      return created;
    })
    .catch((error: unknown) =>
      dependencies.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
    );

  return toRosterShiftDto(shift);
}

export async function updateRosterShiftMutation(
  dependencies: RosterShiftMutationDependencies,
  user: AuthenticatedIdentity,
  rosterId: string,
  shiftId: string,
  payload: unknown,
) {
  const actor = await dependencies.personForUser(user);
  const parsed = UpdateShiftSchema.parse(payload);

  const shift = await dependencies.prisma.shift.findFirst({
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

  dependencies.assertCanWriteRoster(
    user,
    actor.organizationUnitId,
    shift.roster.organizationUnitId,
  );
  dependencies.assertRosterIsDraft(shift.roster.status);

  const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : shift.startTime;
  const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : shift.endTime;
  dependencies.assertShiftInsideRoster(shift.roster, nextStartTime, nextEndTime);
  const sourceGuard = {
    organizationUnitId: shift.roster.organizationUnitId,
    from: shift.startTime,
    to: shift.endTime,
  };
  const destinationGuard = {
    organizationUnitId: shift.roster.organizationUnitId,
    from: nextStartTime,
    to: nextEndTime,
  };
  const closingAttempts = [
    { from: shift.startTime, to: shift.endTime },
    { from: nextStartTime, to: nextEndTime },
  ]
    .filter(
      (range, index, ranges) =>
        ranges.findIndex(
          (candidate) =>
            candidate.from.getTime() === range.from.getTime() &&
            candidate.to.getTime() === range.to.getTime(),
        ) === index,
    )
    .sort(
      (left, right) =>
        left.from.getTime() - right.from.getTime() || left.to.getTime() - right.to.getTime(),
    )
    .map((range) => ({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      ...range,
      attemptedAction: 'SHIFT_UPDATE',
      entityType: 'Shift',
      entityId: shift.id,
    }));
  const firstClosingAttempt = closingAttempts[0];
  if (!firstClosingAttempt) {
    throw new Error('Shift update produced no closing-period validation range.');
  }
  let closingAttempt = firstClosingAttempt;
  for (const attempt of closingAttempts) {
    closingAttempt = attempt;
    await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRange(attempt);
  }

  const updated = await dependencies.prisma
    .$transaction(async (tx) => {
      for (const attempt of closingAttempts) {
        closingAttempt = attempt;
        await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: attempt.organizationUnitId,
            from: attempt.from,
            to: attempt.to,
          },
          tx,
        );
      }
      await lockRosterWrites(tx, [rosterId]);
      const current = await tx.shift.findFirst({
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

      if (!current) {
        throw new NotFoundException('Shift not found.');
      }

      dependencies.assertClosingGuardIsCurrent(sourceGuard, {
        organizationUnitId: current.roster.organizationUnitId,
        from: current.startTime,
        to: current.endTime,
      });
      const currentStartTime = parsed.startTime ? new Date(parsed.startTime) : current.startTime;
      const currentEndTime = parsed.endTime ? new Date(parsed.endTime) : current.endTime;
      dependencies.assertClosingGuardIsCurrent(destinationGuard, {
        organizationUnitId: current.roster.organizationUnitId,
        from: currentStartTime,
        to: currentEndTime,
      });
      dependencies.assertCanWriteRoster(
        user,
        actor.organizationUnitId,
        current.roster.organizationUnitId,
      );
      dependencies.assertRosterIsDraft(current.roster.status);
      const assignedPersonIds = current.assignments.map((assignment) => assignment.personId);
      await lockPersonWrites(tx, assignedPersonIds);
      dependencies.assertShiftInsideRoster(current.roster, currentStartTime, currentEndTime);

      for (const personId of assignedPersonIds) {
        await dependencies.ensureNoOverlappingAssignedShift(
          personId,
          currentStartTime,
          currentEndTime,
          current.id,
          tx,
        );
      }

      const changed = await tx.shift.update({
        where: { id: current.id },
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

      await dependencies.appendAudit(
        {
          actorId: actor.id,
          action: 'SHIFT_UPDATED',
          entityType: 'Shift',
          entityId: changed.id,
          before: {
            startTime: current.startTime.toISOString(),
            endTime: current.endTime.toISOString(),
            shiftType: current.shiftType,
            minStaffing: current.minStaffing,
          },
          after: {
            startTime: changed.startTime.toISOString(),
            endTime: changed.endTime.toISOString(),
            shiftType: changed.shiftType,
            minStaffing: changed.minStaffing,
          },
        },
        tx,
      );

      return changed;
    })
    .catch((error: unknown) =>
      dependencies.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
    );

  return toRosterShiftDto(updated);
}

export async function deleteRosterShiftMutation(
  dependencies: RosterShiftMutationDependencies,
  user: AuthenticatedIdentity,
  rosterId: string,
  shiftId: string,
) {
  const actor = await dependencies.personForUser(user);

  const shift = await dependencies.prisma.shift.findFirst({
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

  dependencies.assertCanWriteRoster(
    user,
    actor.organizationUnitId,
    shift.roster.organizationUnitId,
  );
  dependencies.assertRosterIsDraft(shift.roster.status);
  const closingAttempt = {
    actorId: actor.id,
    organizationUnitId: shift.roster.organizationUnitId,
    from: shift.startTime,
    to: shift.endTime,
    attemptedAction: 'SHIFT_DELETE',
    entityType: 'Shift',
    entityId: shift.id,
  };
  await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

  await dependencies.prisma
    .$transaction(async (tx) => {
      await dependencies.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
        {
          organizationUnitId: shift.roster.organizationUnitId,
          from: shift.startTime,
          to: shift.endTime,
        },
        tx,
      );
      await lockRosterWrites(tx, [rosterId]);
      const current = await tx.shift.findFirst({
        where: { id: shiftId, rosterId },
        include: {
          roster: { select: { organizationUnitId: true, status: true } },
          _count: { select: { bookings: true } },
          assignments: { select: { personId: true } },
        },
      });

      if (!current) {
        throw new NotFoundException('Shift not found.');
      }

      dependencies.assertClosingGuardIsCurrent(closingAttempt, {
        organizationUnitId: current.roster.organizationUnitId,
        from: current.startTime,
        to: current.endTime,
      });
      dependencies.assertCanWriteRoster(
        user,
        actor.organizationUnitId,
        current.roster.organizationUnitId,
      );
      dependencies.assertRosterIsDraft(current.roster.status);
      await lockPersonWrites(
        tx,
        current.assignments.map((assignment) => assignment.personId),
      );
      if (current._count.bookings > 0) {
        throw new BadRequestException('Cannot delete shift with existing bookings.');
      }

      await tx.shiftAssignment.deleteMany({ where: { shiftId: current.id } });
      await tx.shift.delete({ where: { id: current.id } });
      await dependencies.appendAudit(
        {
          actorId: actor.id,
          action: 'SHIFT_DELETED',
          entityType: 'Shift',
          entityId: current.id,
          before: { rosterId },
        },
        tx,
      );
    })
    .catch((error: unknown) =>
      dependencies.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
    );

  return { deleted: true, shiftId };
}
