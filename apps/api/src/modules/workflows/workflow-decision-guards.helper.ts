/** Prepares transactional write guards before a workflow decision is applied. */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { type Prisma, WorkflowType } from '@cueq/database';
import {
  BookingCorrectionSchema,
  OvertimeApprovalRequestSchema,
  ShiftSwapRequestSchema,
} from '@cueq/contracts';
import type { ClosingBlockedAttemptInput } from '../../platform/transactions/closing-lock.helper.js';
import type { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import {
  lockPersonWrites,
  lockRosterWrites,
} from '../../platform/transactions/transaction-lock.helper.js';

type DecisionWorkflowScope = {
  type: WorkflowType;
  entityType: string;
  entityId: string;
  requestPayload: unknown;
};

type GuardedRange = { from: Date; to: Date };

type GuardDependencies = Pick<
  ClosingLockHelper,
  'assertClosingPeriodUnlockedForRangeInTransaction'
>;

export type WorkflowDecisionGuardContext = {
  tx: Prisma.TransactionClient;
  workflowId: string;
  requestedAction: string;
  actorId: string;
  closingLockHelper: GuardDependencies;
  recordBlockedAttempt: (attempt: ClosingBlockedAttemptInput) => void;
};

type ScopedGuardContext = Omit<WorkflowDecisionGuardContext, 'workflowId'> & {
  scope: DecisionWorkflowScope;
};

type BookingForCorrection = {
  personId: string;
  startTime: Date;
  endTime: Date | null;
  person: { organizationUnitId: string };
};

/**
 * Applies closing-period and concurrent-write guards in the same order as the
 * decision mutation that follows. All database work is intentionally serial.
 */
export async function prepareDecisionGuards(
  context: WorkflowDecisionGuardContext,
): Promise<ClosingBlockedAttemptInput | null> {
  const workflowScope = await context.tx.workflowInstance.findUnique({
    where: { id: context.workflowId },
    select: { type: true, entityType: true, entityId: true, requestPayload: true },
  });
  if (!workflowScope) return null;

  const guardContext: ScopedGuardContext = {
    ...context,
    scope: workflowScope as DecisionWorkflowScope,
  };
  return (
    (await guardBookingCorrection(guardContext)) ??
    (await guardAbsence(guardContext)) ??
    (await guardShiftSwap(guardContext)) ??
    guardOvertime(guardContext)
  );
}

async function guardBookingCorrection(
  context: ScopedGuardContext,
): Promise<ClosingBlockedAttemptInput | null> {
  const { scope } = context;
  if (!isBookingCorrectionApproval(scope, context.requestedAction)) return null;

  const correction = BookingCorrectionSchema.parse(scope.requestPayload ?? {});
  const booking = await loadBookingForCorrection(context.tx, scope.entityId);
  assertCorrectionMatchesBooking(correction, booking, scope.entityId);
  const ranges = correctionRanges(booking, correction);
  const blockedAttempt = await guardBookingRanges({
    ...context,
    organizationUnitId: booking.person.organizationUnitId,
    bookingId: scope.entityId,
    ranges,
  });
  await lockPersonWrites(context.tx, [booking.personId]);
  await assertBookingUnchanged(context.tx, scope.entityId, booking);
  return blockedAttempt;
}

function isBookingCorrectionApproval(scope: DecisionWorkflowScope, action: string): boolean {
  return (
    scope.type === WorkflowType.BOOKING_CORRECTION &&
    scope.entityType === 'Booking' &&
    action === 'APPROVE'
  );
}

async function loadBookingForCorrection(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<BookingForCorrection> {
  const booking = await tx.booking.findUnique({
    where: { id },
    select: {
      personId: true,
      startTime: true,
      endTime: true,
      person: { select: { organizationUnitId: true } },
    },
  });
  if (!booking) throw new NotFoundException('Booking not found for approved correction.');
  return booking;
}

function assertCorrectionMatchesBooking(
  correction: { bookingId: string; startTime?: string; endTime?: string },
  booking: Pick<BookingForCorrection, 'startTime' | 'endTime'>,
  bookingId: string,
): void {
  if (correction.bookingId !== bookingId) {
    throw new BadRequestException('Booking correction payload does not match its workflow target.');
  }
  const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
  const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
  if (endTime && startTime >= endTime) {
    throw new BadRequestException('Corrected booking endTime must be after startTime.');
  }
}

function correctionRanges(
  booking: Pick<BookingForCorrection, 'startTime' | 'endTime'>,
  correction: { startTime?: string; endTime?: string },
): GuardedRange[] {
  const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
  const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
  const candidates = [
    { from: booking.startTime, to: booking.endTime ?? booking.startTime },
    { from: startTime, to: endTime ?? startTime },
  ];
  const uniqueRanges = new Map<string, GuardedRange>();
  for (const range of candidates) {
    uniqueRanges.set(`${range.from.getTime()}:${range.to.getTime()}`, range);
  }
  return [...uniqueRanges.values()].sort(
    (left, right) =>
      left.from.getTime() - right.from.getTime() || left.to.getTime() - right.to.getTime(),
  );
}

async function guardBookingRanges(
  context: ScopedGuardContext & {
    organizationUnitId: string;
    bookingId: string;
    ranges: GuardedRange[];
  },
): Promise<ClosingBlockedAttemptInput> {
  let latestAttempt: ClosingBlockedAttemptInput | null = null;
  for (const range of context.ranges) {
    latestAttempt = blockedAttempt({
      actorId: context.actorId,
      organizationUnitId: context.organizationUnitId,
      range,
      attemptedAction: 'WORKFLOW_BOOKING_CORRECTION_APPROVE',
      entityType: 'Booking',
      entityId: context.bookingId,
    });
    context.recordBlockedAttempt(latestAttempt);
    await context.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
      { organizationUnitId: context.organizationUnitId, ...range },
      context.tx,
    );
  }
  if (!latestAttempt) {
    throw new Error('Booking correction requires at least one guarded time range.');
  }
  return latestAttempt;
}

async function assertBookingUnchanged(
  tx: Prisma.TransactionClient,
  bookingId: string,
  expected: BookingForCorrection,
): Promise<void> {
  const current = await loadBookingForCorrection(tx, bookingId);
  if (bookingsMatch(current, expected)) return;

  throw new ConflictException({
    code: 'BOOKING_CHANGED',
    message: 'Booking changed while preparing the correction; retry the workflow decision.',
    retryable: true,
  });
}

function bookingsMatch(current: BookingForCorrection, expected: BookingForCorrection): boolean {
  return (
    current.personId === expected.personId &&
    current.person.organizationUnitId === expected.person.organizationUnitId &&
    current.startTime.getTime() === expected.startTime.getTime() &&
    current.endTime?.getTime() === expected.endTime?.getTime()
  );
}

async function guardAbsence(
  context: ScopedGuardContext,
): Promise<ClosingBlockedAttemptInput | null> {
  const { scope } = context;
  if (
    scope.entityType !== 'Absence' ||
    !['APPROVE', 'REJECT', 'CANCEL'].includes(context.requestedAction)
  ) {
    return null;
  }
  const absence = await context.tx.absence.findUnique({
    where: { id: scope.entityId },
    select: {
      personId: true,
      startDate: true,
      endDate: true,
      person: { select: { organizationUnitId: true } },
    },
  });
  if (!absence) return null;

  const range = { from: absence.startDate, to: absence.endDate };
  const attempt = blockedAttempt({
    actorId: context.actorId,
    organizationUnitId: absence.person.organizationUnitId,
    range,
    attemptedAction: `WORKFLOW_ABSENCE_${context.requestedAction}`,
    entityType: 'Absence',
    entityId: scope.entityId,
  });
  context.recordBlockedAttempt(attempt);
  await guardPersonRange({
    ...context,
    personId: absence.personId,
    organizationUnitId: absence.person.organizationUnitId,
    range,
  });
  return attempt;
}

async function guardShiftSwap(
  context: ScopedGuardContext,
): Promise<ClosingBlockedAttemptInput | null> {
  const { scope } = context;
  if (
    scope.type !== WorkflowType.SHIFT_SWAP ||
    scope.entityType !== 'Shift' ||
    context.requestedAction !== 'APPROVE'
  ) {
    return null;
  }
  const swap = ShiftSwapRequestSchema.parse(scope.requestPayload ?? {});
  const shiftId = swap.shiftId || scope.entityId;
  const shift = await context.tx.shift.findUnique({
    where: { id: shiftId },
    select: {
      rosterId: true,
      startTime: true,
      endTime: true,
      roster: { select: { organizationUnitId: true } },
    },
  });
  if (!shift) return null;

  const range = { from: shift.startTime, to: shift.endTime };
  const attempt = blockedAttempt({
    actorId: context.actorId,
    organizationUnitId: shift.roster.organizationUnitId,
    range,
    attemptedAction: 'WORKFLOW_SHIFT_SWAP_APPROVE',
    entityType: 'Shift',
    entityId: shiftId,
  });
  context.recordBlockedAttempt(attempt);
  await context.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
    { organizationUnitId: shift.roster.organizationUnitId, ...range },
    context.tx,
  );
  await lockRosterWrites(context.tx, [shift.rosterId]);
  await lockPersonWrites(context.tx, [swap.fromPersonId, swap.toPersonId]);
  return attempt;
}

async function guardOvertime(
  context: ScopedGuardContext,
): Promise<ClosingBlockedAttemptInput | null> {
  const { scope } = context;
  if (
    scope.type !== WorkflowType.OVERTIME_APPROVAL ||
    scope.entityType !== 'TimeAccount' ||
    context.requestedAction !== 'APPROVE'
  ) {
    return null;
  }
  const overtime = OvertimeApprovalRequestSchema.parse(scope.requestPayload ?? {});
  const person = await context.tx.person.findUnique({
    where: { id: overtime.personId },
    select: { organizationUnitId: true },
  });
  if (!person) return null;

  const range = { from: new Date(overtime.periodStart), to: new Date(overtime.periodEnd) };
  const attempt = blockedAttempt({
    actorId: context.actorId,
    organizationUnitId: person.organizationUnitId,
    range,
    attemptedAction: 'WORKFLOW_OVERTIME_APPROVE',
    entityType: 'TimeAccount',
    entityId: scope.entityId,
  });
  context.recordBlockedAttempt(attempt);
  await guardPersonRange({
    ...context,
    personId: overtime.personId,
    organizationUnitId: person.organizationUnitId,
    range,
  });
  return attempt;
}

function blockedAttempt(input: {
  actorId: string;
  organizationUnitId: string | null;
  range: GuardedRange;
  attemptedAction: string;
  entityType: string;
  entityId: string;
}): ClosingBlockedAttemptInput {
  const { range, ...attempt } = input;
  return { ...attempt, ...range };
}

async function guardPersonRange(
  context: ScopedGuardContext & {
    personId: string;
    organizationUnitId: string;
    range: GuardedRange;
  },
): Promise<void> {
  await context.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
    { organizationUnitId: context.organizationUnitId, ...context.range },
    context.tx,
  );
  await lockPersonWrites(context.tx, [context.personId]);
  await assertLockedPersonOrganizationUnit(
    context.tx,
    context.personId,
    context.organizationUnitId,
  );
}

async function assertLockedPersonOrganizationUnit(
  tx: Prisma.TransactionClient,
  personId: string,
  expectedOrganizationUnitId: string,
): Promise<void> {
  const person = await tx.person.findUnique({
    where: { id: personId },
    select: { organizationUnitId: true },
  });
  if (!person) {
    throw new NotFoundException('Person not found.');
  }
  if (person.organizationUnitId !== expectedOrganizationUnitId) {
    throw new ConflictException({
      code: 'PERSON_IDENTITY_CHANGED',
      message: 'Person organization assignment changed; retry the workflow decision.',
      retryable: true,
    });
  }
}
