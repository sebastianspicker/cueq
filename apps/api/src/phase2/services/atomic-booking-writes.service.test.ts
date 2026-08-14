import { ConflictException } from '@nestjs/common';
import { BookingSource } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { BookingDomainService } from './booking-domain.service.js';
import {
  ACTOR_ID,
  BOOKING_ID,
  ORGANIZATION_UNIT_ID,
  TIME_TYPE_ID,
  bookingService,
  personForActor,
  transactionPrisma,
  user,
} from './atomic-domain-writes.test-support.js';

describe('atomic domain writes', () => {
  it('writes a booking, audit entry, and outbox event through the same transaction client', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
      booking: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: BOOKING_ID,
          personId: ACTOR_ID,
          timeTypeId: TIME_TYPE_ID,
          startTime: new Date('2026-07-14T08:00:00.000Z'),
          endTime: new Date('2026-07-14T12:00:00.000Z'),
          source: BookingSource.MANUAL,
          timeType: { code: 'WORK', category: 'WORK' },
          note: null,
          shiftId: null,
          createdAt: new Date('2026-07-14T08:00:00.000Z'),
          updatedAt: new Date('2026-07-14T08:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
      booking: { create: vi.fn() },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const eventOutboxHelper = { enqueueDomainEvent: vi.fn().mockResolvedValue(undefined) };
    const service = bookingService(prisma, auditHelper, eventOutboxHelper);

    await service.createBooking(user as never, {
      personId: ACTOR_ID,
      timeTypeId: TIME_TYPE_ID,
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T12:00:00.000Z',
      source: BookingSource.MANUAL,
    });

    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_CREATED', entityId: BOOKING_ID }),
      tx,
    );
    expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'booking.created', aggregateId: BOOKING_ID }),
      tx,
    );
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('aborts booking creation when the locked person moved organization units', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: 'ckz00000000000000000000999',
        }),
      },
      booking: { findFirst: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: ACTOR_ID, organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const service = bookingService(
      prisma,
      { appendAudit: vi.fn() },
      { enqueueDomainEvent: vi.fn() },
    );

    await expect(
      service.createBooking(user as never, {
        personId: ACTOR_ID,
        timeTypeId: TIME_TYPE_ID,
        startTime: '2026-07-14T08:00:00.000Z',
        source: BookingSource.MANUAL,
      }),
    ).rejects.toMatchObject({ response: { code: 'PERSON_IDENTITY_CHANGED', retryable: true } });

    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('locks and re-reads the person before checking overlap and writing a booking', async () => {
    const writes: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        writes.push('person-lock');
        return [{ acquired: true }];
      }),
      person: {
        findUnique: vi.fn(async () => {
          writes.push('person-reread');
          return { organizationUnitId: ORGANIZATION_UNIT_ID };
        }),
      },
      booking: {
        findFirst: vi.fn(async () => {
          writes.push('overlap-check');
          return null;
        }),
        create: vi.fn(async () => {
          writes.push('booking-create');
          return {
            id: BOOKING_ID,
            personId: ACTOR_ID,
            timeTypeId: TIME_TYPE_ID,
            startTime: new Date('2026-07-14T08:00:00.000Z'),
            endTime: null,
            source: BookingSource.MANUAL,
            timeType: { code: 'WORK', category: 'WORK' },
            note: null,
            shiftId: null,
            createdAt: new Date('2026-07-14T08:00:00.000Z'),
            updatedAt: new Date('2026-07-14T08:00:00.000Z'),
          };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_input, db) => {
        expect(db).toBe(tx);
        writes.push('audit');
      }),
    };
    const eventOutboxHelper = {
      enqueueDomainEvent: vi.fn(async (_input, db) => {
        expect(db).toBe(tx);
        writes.push('outbox');
      }),
    };

    await bookingService(prisma, auditHelper, eventOutboxHelper).createBooking(user as never, {
      personId: ACTOR_ID,
      timeTypeId: TIME_TYPE_ID,
      startTime: '2026-07-14T08:00:00.000Z',
      source: BookingSource.MANUAL,
    });

    expect(writes).toEqual([
      'person-lock',
      'person-reread',
      'overlap-check',
      'booking-create',
      'audit',
      'outbox',
    ]);
  });

  it('rejects an overlapping booking without creating, auditing, or enqueuing it', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
      booking: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-booking' }),
        create: vi.fn(),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const auditHelper = { appendAudit: vi.fn() };
    const eventOutboxHelper = { enqueueDomainEvent: vi.fn() };

    await expect(
      bookingService(prisma, auditHelper, eventOutboxHelper).createBooking(user as never, {
        personId: ACTOR_ID,
        timeTypeId: TIME_TYPE_ID,
        startTime: '2026-07-14T08:00:00.000Z',
        endTime: '2026-07-14T12:00:00.000Z',
        source: BookingSource.MANUAL,
      }),
    ).rejects.toThrow('Booking overlaps with existing booking.');

    expect(tx.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: ACTOR_ID,
          startTime: { lt: new Date('2026-07-14T12:00:00.000Z') },
          OR: [{ endTime: null }, { endTime: { gt: new Date('2026-07-14T08:00:00.000Z') } }],
        },
      }),
    );
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('routes a transaction-time booking closing conflict through durable audit', async () => {
    const conflict = new ConflictException({ code: 'CLOSING_PERIOD_LOCKED' });
    const durableAudit = vi.fn((error: unknown) => {
      throw error;
    });
    const prisma = {
      ...transactionPrisma({}),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const service = new BookingDomainService(
      prisma as never,
      personForActor() as never,
      {} as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockRejectedValue(conflict),
        rethrowWithDurableClosingAudit: durableAudit,
      } as never,
      {} as never,
    );

    await expect(
      service.createBooking(user as never, {
        personId: ACTOR_ID,
        timeTypeId: TIME_TYPE_ID,
        startTime: '2026-07-14T08:00:00.000Z',
        source: BookingSource.MANUAL,
      }),
    ).rejects.toBe(conflict);

    expect(durableAudit).toHaveBeenCalledWith(
      conflict,
      expect.objectContaining({
        attemptedAction: 'BOOKING_CREATE',
        entityId: `${ACTOR_ID}:2026-07-14T08:00:00.000Z`,
        organizationUnitId: ORGANIZATION_UNIT_ID,
      }),
    );
  });
});
