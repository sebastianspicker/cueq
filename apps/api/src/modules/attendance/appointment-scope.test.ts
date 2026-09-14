import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingDomainService } from './booking-domain.service.js';
import { writeBookingCreation } from './booking-create.writer.js';
import { toBookingDto } from './booking-response.mapper.js';

const ids = {
  actor: 'c00000000000000000000001',
  person: 'c00000000000000000000002',
  assignment: 'c00000000000000000000003',
  timeType: 'c00000000000000000000004',
};

function service(input: { prisma?: object; assignments: object; closing?: object }) {
  return new BookingDomainService(
    (input.prisma ?? {}) as never,
    { personForUser: vi.fn().mockResolvedValue({ id: ids.actor }) } as never,
    input.assignments as never,
    { appendAudit: vi.fn() } as never,
    (input.closing ?? {}) as never,
    { enqueueDomainEvent: vi.fn() } as never,
  );
}

describe('attendance appointment scope', () => {
  it('propagates ambiguous appointment selection before listing bookings', async () => {
    const findMany = vi.fn();
    const error = new ConflictException({ code: 'ASSIGNMENT_REQUIRED' });
    const bookingService = service({
      prisma: { booking: { findMany } },
      assignments: { selectAssignment: vi.fn().mockRejectedValue(error) },
    });

    await expect(bookingService.listMyBookings({} as never, {})).rejects.toBe(error);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a booking outside the selected appointment before closing or writes', async () => {
    const closing = { assertClosingPeriodUnlockedForRange: vi.fn() };
    const error = new ConflictException({ code: 'ASSIGNMENT_NOT_EFFECTIVE' });
    const bookingService = service({
      prisma: {},
      assignments: { resolveInterval: vi.fn().mockRejectedValue(error) },
      closing,
    });

    await expect(
      bookingService.createBooking({} as never, {
        personId: ids.actor,
        assignmentId: ids.assignment,
        timeTypeId: ids.timeType,
        startTime: '2026-09-08T08:00:00.000Z',
        endTime: '2026-09-08T09:00:00.000Z',
        source: 'WEB',
      }),
    ).rejects.toBe(error);
    expect(closing.assertClosingPeriodUnlockedForRange).not.toHaveBeenCalled();
  });

  it('keeps booking overlap checks person-wide across appointments', async () => {
    const booking = {
      findFirst: vi.fn().mockResolvedValue({ id: 'other-appointment-booking' }),
      create: vi.fn(),
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      booking,
      shiftAssignment: { findUnique: vi.fn() },
    };
    const resolved = {
      assignment: { id: ids.assignment, personId: ids.person },
    };

    await expect(
      writeBookingCreation(tx as never, {
        actorId: ids.actor,
        parsed: {
          personId: ids.person,
          assignmentId: ids.assignment,
          timeTypeId: ids.timeType,
          startTime: '2026-09-08T08:00:00.000Z',
          endTime: '2026-09-08T09:00:00.000Z',
          source: 'WEB',
        },
        resolved: resolved as never,
        startTime: new Date('2026-09-08T08:00:00.000Z'),
        endTime: new Date('2026-09-08T09:00:00.000Z'),
        from: new Date('2026-09-08T08:00:00.000Z'),
        assignmentHelper: { assertUnchanged: vi.fn().mockResolvedValue(resolved) } as never,
        assertClosingUnlocked: vi.fn().mockResolvedValue(undefined),
        auditHelper: { appendAudit: vi.fn() },
        eventOutboxHelper: { enqueueDomainEvent: vi.fn() },
      }),
    ).rejects.toThrow('Booking overlaps with existing booking.');
    expect(booking.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ personId: ids.person }),
    });
    expect(booking.create).not.toHaveBeenCalled();
  });

  it('includes the persisted appointment in booking DTOs', () => {
    const now = new Date('2026-09-08T08:00:00.000Z');
    expect(
      toBookingDto({
        id: 'booking',
        personId: ids.person,
        assignmentId: ids.assignment,
        timeTypeId: ids.timeType,
        timeType: { code: 'WORK', category: 'WORK' },
        startTime: now,
        endTime: null,
        source: 'WEB',
        note: null,
        shiftId: null,
        createdAt: now,
        updatedAt: now,
      } as never),
    ).toMatchObject({ assignmentId: ids.assignment });
  });
});
