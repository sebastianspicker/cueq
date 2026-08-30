/** Performs one fully transaction-local booking creation in its established serial order. */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { type BookingSource, type Prisma } from '@cueq/database';
import type { CreateBooking } from '@cueq/contracts';
import { bookingOverlapWhere } from '../../persistence/queries/booking-overlap.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';

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
    targetPerson: { organizationUnitId: string | null };
    startTime: Date;
    endTime: Date | null;
    from: Date;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
    eventOutboxHelper: EventOutboxWriter;
  },
): Promise<BookingWithTimeType> {
  const {
    actorId,
    parsed,
    targetPerson,
    startTime,
    endTime,
    from,
    assertClosingUnlocked,
    auditHelper,
    eventOutboxHelper,
  } = input;

  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [parsed.personId]);
  const currentTargetPerson = await tx.person.findUnique({
    where: { id: parsed.personId },
    select: { organizationUnitId: true },
  });
  if (!currentTargetPerson) {
    throw new NotFoundException('Person not found.');
  }
  if (currentTargetPerson.organizationUnitId !== targetPerson.organizationUnitId) {
    throw new ConflictException({
      code: 'PERSON_IDENTITY_CHANGED',
      message: 'Person organization assignment changed; retry the booking request.',
      retryable: true,
    });
  }

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

  const booking = await tx.booking.create({
    data: {
      personId: parsed.personId,
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
        timeTypeCode: booking.timeType.code,
        source: booking.source,
      },
    },
    tx,
  );

  return booking;
}
