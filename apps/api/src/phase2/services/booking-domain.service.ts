import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import { CreateBookingSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import { EventOutboxHelper } from '../helpers/event-outbox.helper';
import { assertCanActForPerson } from '../helpers/role-constants';
import { bookingOverlapWhere } from '../helpers/booking-overlap.helper';

@Injectable()
export class BookingDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
  ) {}

  async listMyBookings(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    const bookings = await this.prisma.booking.findMany({
      where: { personId: person.id },
      include: { timeType: true },
      orderBy: { startTime: 'asc' },
    });

    return bookings.map((booking) => this.toBookingDto(booking));
  }

  async createBooking(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateBookingSchema.parse(payload);

    assertCanActForPerson(user, actor.id, parsed.personId);

    if (parsed.source === BookingSource.CORRECTION) {
      throw new BadRequestException(
        'Use POST /v1/closing-periods/{id}/corrections/bookings for controlled correction entries.',
      );
    }
    if (parsed.source === BookingSource.IMPORT || parsed.source === BookingSource.TERMINAL) {
      throw new BadRequestException(
        'Booking source IMPORT/TERMINAL is reserved for integration ingestion paths.',
      );
    }

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const startTime = new Date(parsed.startTime);
    const endTime = parsed.endTime ? new Date(parsed.endTime) : null;
    const from = endTime && startTime > endTime ? endTime : startTime;
    const to = endTime && startTime > endTime ? startTime : (endTime ?? startTime);

    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from,
      to,
      attemptedAction: 'BOOKING_CREATE',
      entityType: 'Booking',
      entityId: `${parsed.personId}:${parsed.startTime}`,
    });

    const booking = await this.prisma.$transaction(async (tx) => {
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

      return tx.booking.create({
        data: {
          personId: parsed.personId,
          timeTypeId: parsed.timeTypeId,
          startTime,
          endTime,
          source: parsed.source as BookingSource,
          note: parsed.note,
          shiftId: parsed.shiftId,
        },
        include: {
          timeType: true,
        },
      });
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
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
    });

    await this.eventOutboxHelper.enqueueDomainEvent({
      eventType: 'booking.created',
      aggregateType: 'Booking',
      aggregateId: booking.id,
      payload: {
        personId: booking.personId,
        timeTypeCode: booking.timeType.code,
        source: booking.source,
      },
    });

    return this.toBookingDto(booking);
  }

  private toBookingDto(booking: Prisma.BookingGetPayload<{ include: { timeType: true } }>) {
    return {
      id: booking.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: booking.timeType.code,
      timeTypeCategory: booking.timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      shiftId: booking.shiftId,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }
}
