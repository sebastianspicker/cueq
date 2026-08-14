import { vi } from 'vitest';
import { AbsenceDomainService } from './absence-domain.service.js';
import { BookingDomainService } from './booking-domain.service.js';

export const ACTOR_ID = 'ckz00000000000000000000001';
export const TIME_TYPE_ID = 'ckz00000000000000000000002';
export const ORGANIZATION_UNIT_ID = 'ckz00000000000000000000003';
export const BOOKING_ID = 'ckz00000000000000000000004';
export const ABSENCE_ID = 'ckz00000000000000000000005';

export const user = {
  subject: 'subject-1',
  email: 'person@example.test',
  role: 'EMPLOYEE',
  claims: {},
} as const;

export function transactionPrisma(tx: object) {
  return {
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
}
export function personForActor() {
  return { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) };
}

export function closingLock() {
  return {
    assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
    assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
    rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
      throw error;
    }),
  };
}

export function bookingService(prisma: object, auditHelper: object, eventOutboxHelper: object) {
  return new BookingDomainService(
    prisma as never,
    personForActor() as never,
    auditHelper as never,
    closingLock() as never,
    eventOutboxHelper as never,
  );
}

export function absenceService(
  prisma: object,
  auditHelper: object,
  workflowRuntimeService: object,
) {
  return new AbsenceDomainService(
    prisma as never,
    personForActor() as never,
    auditHelper as never,
    closingLock() as never,
    { holidayDatesBetween: vi.fn().mockReturnValue([]) } as never,
    workflowRuntimeService as never,
    {} as never,
  );
}
