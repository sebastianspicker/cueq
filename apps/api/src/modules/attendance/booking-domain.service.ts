import { toBookingDto } from './booking-response.mapper.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
/** Owns employee booking reads and guarded booking mutations. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BookingSource } from '@cueq/database';
import { CreateBookingSchema, BookingQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AssignmentHelper, PersonHelper, assertCanActForPerson } from '../people/public.js';
import { AuditHelper, EventOutboxHelper } from '../audit/public.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import { writeBookingCreation } from './booking-create.writer.js';

/**
 * Owns employee booking reads and writes outside controlled closing corrections or integrations.
 * Writes validate lock and overlap invariants, record audit evidence, and enqueue domain events atomically.
 */
@Injectable()
export class BookingDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
  ) {}

  async listMyBookings(user: AuthenticatedIdentity, query: unknown = {}): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    const parsed = BookingQuerySchema.parse(query);
    const assignment = await this.assignmentHelper.selectAssignment(
      person.id,
      parsed.assignmentId,
      undefined,
      parsed.from ? new Date(parsed.from) : undefined,
    );
    const bookings = await this.prisma.booking.findMany({
      where: {
        personId: person.id,
        assignmentId: assignment.id,
        startTime: {
          ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
          ...(parsed.to ? { lt: new Date(parsed.to) } : {}),
        },
        AND: [cursorWhere('startTime', parsed.cursor)],
      },
      include: { timeType: true },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      take: parsed.limit + 1,
    });

    return cursorPage(
      bookings,
      parsed.limit,
      'startTime',
      (row) => row.startTime,
      (booking) => toBookingDto(booking),
    );
  }

  async getBookingById(user: AuthenticatedIdentity, id: string): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { timeType: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    assertCanActForPerson(user, actor.id, booking.personId);
    return toBookingDto(booking);
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

    const startTime = new Date(parsed.startTime);
    const endTime = parsed.endTime ? new Date(parsed.endTime) : null;
    const from = startTime;
    const to = endTime ?? startTime;
    const resolved = await this.assignmentHelper.resolveInterval(
      parsed.personId,
      startTime,
      endTime ?? undefined,
      parsed.assignmentId,
    );

    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: resolved.organizationUnitId,
      from,
      to,
      attemptedAction: 'BOOKING_CREATE',
      entityType: 'Booking',
      entityId: `${parsed.personId}:${parsed.startTime}`,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    const booking = await this.prisma
      .$transaction((tx) =>
        writeBookingCreation(tx, {
          actorId: actor.id,
          parsed,
          resolved,
          startTime,
          endTime,
          from,
          assignmentHelper: this.assignmentHelper,
          assertClosingUnlocked: (transaction) =>
            this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
              {
                organizationUnitId: resolved.organizationUnitId,
                from,
                to,
              },
              transaction,
            ),
          auditHelper: this.auditHelper,
          eventOutboxHelper: this.eventOutboxHelper,
        }),
      )
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );

    return toBookingDto(booking);
  }
}
