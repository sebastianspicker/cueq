/** Performs one fully transaction-local booking creation in its established serial order. */
import { ConflictException } from '@nestjs/common';
import { type BookingSource, type Prisma } from '@cueq/database';
import type { CreateBooking } from '@cueq/contracts';
import { bookingOverlapWhere } from '../../persistence/queries/booking-overlap.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type { AssignmentHelper, ResolvedEmployment } from '../people/public.js';

type AuditWriter = {
  appendAudit: (
    input: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      after?: Prisma.JsonValue;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<unknown>;
};

type EventOutboxWriter = {
  enqueueDomainEvent: (
    input: {
      eventType: 'booking.created';
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<unknown>;
};

type BookingWithTimeType = Prisma.BookingGetPayload<{ include: { timeType: true } }>;

export async function writeBookingCreation(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    parsed: CreateBooking;
    resolved: ResolvedEmployment;
    startTime: Date;
    endTime: Date | null;
    from: Date;
    assignmentHelper: Pick<AssignmentHelper, 'assertUnchanged'>;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
    eventOutboxHelper: EventOutboxWriter;
  },
): Promise<BookingWithTimeType> {
  const {
    actorId,
    parsed,
    resolved,
    startTime,
    endTime,
    from,
    assignmentHelper,
    assertClosingUnlocked,
    auditHelper,
    eventOutboxHelper,
  } = input;

  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [parsed.personId]);
  const current = await assignmentHelper.assertUnchanged(
    tx,
    resolved,
    startTime,
    endTime ?? undefined,
  );

  const overlap = await tx.booking.findFirst({
    where: bookingOverlapWhere({
      personId: parsed.personId,
      startTime: from,
      endTime,
    }),
  });
  if (overlap) {
    throw new ConflictException('Booking overlaps with existing booking.');
  }

  if (parsed.shiftId) {
    const shiftAssignment = await tx.shiftAssignment.findUnique({
      where: { shiftId_personId: { shiftId: parsed.shiftId, personId: parsed.personId } },
      select: { assignmentId: true },
    });
    if (!shiftAssignment || shiftAssignment.assignmentId !== current.assignment.id) {
      throw new ConflictException('Booking shift does not belong to the selected appointment.');
    }
  }

  const booking = await tx.booking.create({
    data: {
      personId: parsed.personId,
      assignmentId: current.assignment.id,
      timeTypeId: parsed.timeTypeId,
      startTime,
      endTime,
      source: parsed.source as BookingSource,
      note: parsed.note,
      shiftId: parsed.shiftId,
    },
    include: { timeType: true },
  });

  await auditHelper.appendAudit(
    {
      actorId,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        personId: booking.personId,
        assignmentId: booking.assignmentId,
        timeTypeId: booking.timeTypeId,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        source: booking.source,
      },
    },
    tx,
  );

  await eventOutboxHelper.enqueueDomainEvent(
    {
      eventType: 'booking.created',
      aggregateType: 'Booking',
      aggregateId: booking.id,
      payload: {
        personId: booking.personId,
        assignmentId: booking.assignmentId,
        timeTypeCode: booking.timeType.code,
        source: booking.source,
      },
    },
    tx,
  );

  return booking;
}
