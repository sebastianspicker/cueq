import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Role, WorkflowType } from '@cueq/database';
import { WorkflowsDomainService } from './workflows-domain.service.js';

const ids = {
  workflow: 'clwflow000000000000000001',
  absence: 'clabsence00000000000000001',
  booking: 'clbooking00000000000000001',
  person: 'clperson000000000000000001',
};

const ACTOR = {
  subject: 'subject',
  email: 'lead@example.test',
  role: Role.TEAM_LEAD,
  claims: {},
};
const ORGANIZATION_UNIT_ID = 'clorg00000000000000000001';

function transactionPrisma<T>(tx: T) {
  return {
    $transaction: vi.fn(async (callback: (database: T) => Promise<unknown>) => callback(tx)),
  };
}

function bookingFixture(overrides: object = {}) {
  return {
    personId: ids.person,
    startTime: new Date('2026-03-02T08:00:00.000Z'),
    endTime: new Date('2026-03-02T12:00:00.000Z'),
    person: { organizationUnitId: ORGANIZATION_UNIT_ID },
    ...overrides,
  };
}

function bookingCorrectionWorkflow(requestPayload: object) {
  return {
    type: WorkflowType.BOOKING_CORRECTION,
    entityType: 'Booking',
    entityId: ids.booking,
    requestPayload,
  };
}

function decisionService(
  prisma: object,
  runtime: object,
  sideEffects: object = {
    validatePreApproval: vi.fn().mockResolvedValue(undefined),
    applyDecisionSideEffects: vi.fn().mockResolvedValue(undefined),
  },
  closingLock: object = {
    assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
  },
) {
  return new WorkflowsDomainService(
    prisma as never,
    {
      personForUser: vi.fn().mockResolvedValue({
        id: 'clactor000000000000000001',
        organizationUnitId: ORGANIZATION_UNIT_ID,
      }),
    } as never,
    runtime as never,
    {} as never,
    sideEffects as never,
    closingLock as never,
  );
}

function approveWorkflow(service: WorkflowsDomainService) {
  return service.decideWorkflow(ACTOR, ids.workflow, { action: 'APPROVE' });
}

describe('WorkflowsDomainService decision write guards', () => {
  it('guards both the original and corrected booking ranges before applying a correction', async () => {
    const original = bookingFixture();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue(
          bookingCorrectionWorkflow({
            bookingId: ids.booking,
            startTime: '2026-04-02T08:30:00.000Z',
            endTime: '2026-04-02T12:30:00.000Z',
            reason: 'Move the booking to the correct month.',
          }),
        ),
      },
      booking: { findUnique: vi.fn().mockResolvedValue(original) },
    };
    const prisma = transactionPrisma(tx);
    const runtime = {
      normalizeAction: vi.fn().mockReturnValue('APPROVE'),
      decide: vi.fn().mockResolvedValue({ updated: { id: ids.workflow } }),
    };
    const sideEffects = {
      validatePreApproval: vi.fn().mockResolvedValue(undefined),
      applyDecisionSideEffects: vi.fn().mockResolvedValue(undefined),
    };
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const service = decisionService(prisma, runtime, sideEffects, closingLock);

    await approveWorkflow(service);

    expect(closingLock.assertClosingPeriodUnlockedForRangeInTransaction.mock.calls).toEqual([
      [
        {
          organizationUnitId: ORGANIZATION_UNIT_ID,
          from: new Date('2026-03-02T08:00:00.000Z'),
          to: new Date('2026-03-02T12:00:00.000Z'),
        },
        tx,
      ],
      [
        {
          organizationUnitId: ORGANIZATION_UNIT_ID,
          from: new Date('2026-04-02T08:30:00.000Z'),
          to: new Date('2026-04-02T12:30:00.000Z'),
        },
        tx,
      ],
    ]);
    expect(tx.booking.findUnique).toHaveBeenCalledTimes(2);
    expect(runtime.decide).toHaveBeenCalledTimes(1);
  });

  it('deduplicates an unchanged correction range before locking the person', async () => {
    const original = bookingFixture();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowInstance: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            bookingCorrectionWorkflow({ bookingId: ids.booking, reason: 'No time change.' }),
          ),
      },
      booking: { findUnique: vi.fn().mockResolvedValue(original) },
    };
    const prisma = transactionPrisma(tx);
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = {
      normalizeAction: vi.fn().mockReturnValue('APPROVE'),
      decide: vi.fn().mockResolvedValue({ updated: { id: ids.workflow } }),
    };
    const service = decisionService(prisma, runtime, undefined, closingLock);

    await approveWorkflow(service);

    expect(closingLock.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.booking.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects a booking correction when the guarded booking changes before the person lock', async () => {
    const original = bookingFixture();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue(
          bookingCorrectionWorkflow({
            bookingId: ids.booking,
            startTime: '2026-03-02T08:30:00.000Z',
            reason: 'Correct the booking start time.',
          }),
        ),
      },
      booking: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce({
            ...original,
            startTime: new Date('2026-03-02T08:15:00.000Z'),
          }),
      },
    };
    const prisma = transactionPrisma(tx);
    const runtime = {
      normalizeAction: vi.fn().mockReturnValue('APPROVE'),
      decide: vi.fn(),
    };
    const conflictRethrow = vi.fn((error: unknown) => {
      throw error;
    });
    const service = decisionService(
      prisma,
      runtime,
      { validatePreApproval: vi.fn(), applyDecisionSideEffects: vi.fn() },
      {
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
        rethrowWithDurableClosingAudit: conflictRethrow,
      },
    );

    await expect(approveWorkflow(service)).rejects.toMatchObject({
      response: { code: 'BOOKING_CHANGED', retryable: true },
    });

    expect(runtime.decide).not.toHaveBeenCalled();
    expect(conflictRethrow).toHaveBeenCalledTimes(1);
  });

  it('guards the absence range before locking the affected person and deciding', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        calls.push('person-lock');
        return [{ acquired: true }];
      }),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          entityType: 'Absence',
          entityId: ids.absence,
          requestPayload: {},
        }),
      },
      absence: {
        findUnique: vi.fn().mockResolvedValue({
          personId: ids.person,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-02T00:00:00.000Z'),
          person: { organizationUnitId: ORGANIZATION_UNIT_ID },
        }),
      },
      person: {
        findUnique: vi.fn().mockResolvedValue({
          organizationUnitId: ORGANIZATION_UNIT_ID,
        }),
      },
    };
    const prisma = transactionPrisma(tx);
    const runtime = {
      normalizeAction: vi.fn().mockReturnValue('APPROVE'),
      decide: vi.fn(async () => {
        calls.push('decide');
        return { updated: { id: ids.workflow } };
      }),
    };
    const sideEffects = {
      validatePreApproval: vi.fn().mockResolvedValue(undefined),
      applyDecisionSideEffects: vi.fn().mockResolvedValue(undefined),
    };
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(async () => {
        calls.push('closing-guard');
      }),
    };
    const service = decisionService(prisma, runtime, sideEffects, closingLock);

    await approveWorkflow(service);

    expect(calls).toEqual(['closing-guard', 'person-lock', 'decide']);
    expect(closingLock.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationUnitId: ORGANIZATION_UNIT_ID,
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-02T00:00:00.000Z'),
      }),
      tx,
    );
  });

  it('reroutes a transaction-time closing conflict through the durable audit path', async () => {
    const locked = new ConflictException({ code: 'CLOSING_PERIOD_LOCKED' });
    const tx = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          entityType: 'Absence',
          entityId: ids.absence,
          requestPayload: {},
        }),
      },
      absence: {
        findUnique: vi.fn().mockResolvedValue({
          personId: ids.person,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-02T00:00:00.000Z'),
          person: { organizationUnitId: ORGANIZATION_UNIT_ID },
        }),
      },
    };
    const prisma = transactionPrisma(tx);
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockRejectedValue(locked),
      rethrowWithDurableClosingAudit: vi.fn().mockRejectedValue(locked),
    };
    const service = decisionService(
      prisma,
      { normalizeAction: vi.fn().mockReturnValue('APPROVE') },
      {},
      closingLock,
    );

    await expect(approveWorkflow(service)).rejects.toBe(locked);

    expect(closingLock.rethrowWithDurableClosingAudit).toHaveBeenCalledWith(
      locked,
      expect.objectContaining({
        actorId: 'clactor000000000000000001',
        attemptedAction: 'WORKFLOW_ABSENCE_APPROVE',
        entityType: 'Absence',
        entityId: ids.absence,
      }),
    );
  });
});

describe('WorkflowsDomainService delegated read and policy boundaries', () => {
  it('resolves the actor before delegating the parsed inbox scope to the runtime', async () => {
    const calls: string[] = [];
    const personHelper = {
      personForUser: vi.fn(async () => {
        calls.push('person');
        return { id: 'clactor000000000000000001', organizationUnitId: ORGANIZATION_UNIT_ID };
      }),
    };
    const runtime = {
      listInbox: vi.fn(async () => {
        calls.push('inbox');
        return [{ id: ids.workflow }];
      }),
    };
    const service = new WorkflowsDomainService(
      {} as never,
      personHelper as never,
      runtime as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.workflowInbox(ACTOR, {})).resolves.toEqual([{ id: ids.workflow }]);

    expect(calls).toEqual(['person', 'inbox']);
    expect(runtime.listInbox).toHaveBeenCalledWith(
      {
        id: 'clactor000000000000000001',
        role: Role.TEAM_LEAD,
        organizationUnitId: ORGANIZATION_UNIT_ID,
      },
      expect.any(Object),
    );
  });

  it('rejects non-HR policy writes before resolving the identity or parsing the payload', async () => {
    const personHelper = { personForUser: vi.fn() };
    const runtime = { upsertPolicy: vi.fn() };
    const service = new WorkflowsDomainService(
      {} as never,
      personHelper as never,
      runtime as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.upsertWorkflowPolicy(ACTOR, WorkflowType.LEAVE_REQUEST, { not: 'a valid policy' }),
    ).rejects.toThrow();

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(runtime.upsertPolicy).not.toHaveBeenCalled();
  });
});
