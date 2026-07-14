import { AbsenceStatus, BookingSource, WorkflowStatus, WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { AbsenceDomainService } from './absence-domain.service';
import { BookingDomainService } from './booking-domain.service';

const ACTOR_ID = 'ckz00000000000000000000001';
const TIME_TYPE_ID = 'ckz00000000000000000000002';
const ORGANIZATION_UNIT_ID = 'ckz00000000000000000000003';
const BOOKING_ID = 'ckz00000000000000000000004';
const ABSENCE_ID = 'ckz00000000000000000000005';

const user = {
  subject: 'subject-1',
  email: 'person@example.test',
  role: 'EMPLOYEE',
  claims: {},
} as const;

function transactionPrisma(tx: object) {
  return {
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
}

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
    const service = new BookingDomainService(
      prisma as never,
      { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) } as never,
      auditHelper as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
        rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
          throw error;
        }),
      } as never,
      eventOutboxHelper as never,
    );

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
    const service = new BookingDomainService(
      prisma as never,
      { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) } as never,
      { appendAudit: vi.fn() } as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn(),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(),
        rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
          throw error;
        }),
      } as never,
      { enqueueDomainEvent: vi.fn() } as never,
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

  it('keeps absence, workflow, and both audits in the transaction when an audit write fails', async () => {
    const writes: string[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
      absence: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async () => {
          writes.push('absence');
          return {
            id: ABSENCE_ID,
            personId: ACTOR_ID,
            type: 'ANNUAL_LEAVE',
            startDate: new Date('2026-07-14T00:00:00.000Z'),
            endDate: new Date('2026-07-14T00:00:00.000Z'),
            status: AbsenceStatus.REQUESTED,
          };
        }),
      },
      workflowInstance: {
        create: vi.fn().mockImplementation(async () => {
          writes.push('workflow');
          return {
            id: 'ckz00000000000000000000006',
            type: WorkflowType.LEAVE_REQUEST,
            status: WorkflowStatus.PENDING,
            approverId: 'ckz00000000000000000000007',
            entityType: 'Absence',
            entityId: ABSENCE_ID,
            dueAt: null,
          };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
      absence: { create: vi.fn() },
      workflowInstance: { create: vi.fn() },
    };
    const auditHelper = {
      appendAudit: vi.fn().mockImplementation(async (input, db) => {
        expect(db).toBe(tx);
        writes.push(input.action);
        if (input.action === 'ABSENCE_REQUESTED') throw new Error('audit write failed');
      }),
    };
    const workflowRuntimeService = {
      buildWorkflowAssignment: vi.fn().mockImplementation(async () => {
        expect(prisma.$transaction).not.toHaveBeenCalled();
        return {
          status: WorkflowStatus.PENDING,
          approverId: 'ckz00000000000000000000007',
          submittedAt: new Date('2026-07-14T08:00:00.000Z'),
          dueAt: null,
          escalationLevel: 0,
          delegationTrail: [],
          traversedApprovers: ['ckz00000000000000000000007'],
        };
      }),
    };
    const service = new AbsenceDomainService(
      prisma as never,
      { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) } as never,
      auditHelper as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
        rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
          throw error;
        }),
      } as never,
      { holidayDatesBetween: vi.fn().mockReturnValue([]) } as never,
      workflowRuntimeService as never,
      {} as never,
    );

    await expect(
      service.createAbsence(user as never, {
        personId: ACTOR_ID,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
      }),
    ).rejects.toThrow('audit write failed');

    expect(writes).toEqual(['absence', 'workflow', 'WORKFLOW_CREATED', 'ABSENCE_REQUESTED']);
    expect(prisma.absence.create).not.toHaveBeenCalled();
    expect(prisma.workflowInstance.create).not.toHaveBeenCalled();
  });

  it('aborts absence creation when the locked person changed supervisor or organization unit', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: 'ckz00000000000000000000999',
          supervisorId: 'ckz00000000000000000000008',
        }),
      },
      absence: { findFirst: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
    };
    const service = new AbsenceDomainService(
      prisma as never,
      { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) } as never,
      { appendAudit: vi.fn() } as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn(),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(),
        rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
          throw error;
        }),
      } as never,
      { holidayDatesBetween: vi.fn().mockReturnValue([]) } as never,
      { buildWorkflowAssignment: vi.fn() } as never,
      {} as never,
    );

    await expect(
      service.createAbsence(user as never, {
        personId: ACTOR_ID,
        type: 'SICK',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
      }),
    ).rejects.toMatchObject({ response: { code: 'PERSON_IDENTITY_CHANGED', retryable: true } });

    expect(tx.absence.create).not.toHaveBeenCalled();
  });
});
