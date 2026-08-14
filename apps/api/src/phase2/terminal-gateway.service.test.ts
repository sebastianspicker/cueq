import { ConflictException } from '@nestjs/common';
import { BookingSource, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ClosingLockHelper } from './helpers/closing-lock.helper.js';
import { TerminalGatewayService, TerminalSyncBatchSchema } from './terminal-gateway.service.js';

const PERSON_ID = 'cm0000000000000000000001';
const ACTOR_ID = 'cm0000000000000000000002';

function buildService(existingResult?: Record<string, unknown>) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    terminalSyncBatch: {
      findUnique: vi.fn().mockResolvedValue(
        existingResult
          ? {
              id: 'batch-existing',
              terminalId: 'terminal-1',
              resultPayload: existingResult,
            }
          : null,
      ),
      create: vi.fn().mockResolvedValue({ id: 'batch-new' }),
    },
    terminalDevice: {
      upsert: vi.fn().mockResolvedValue({ id: 'device-1' }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'device-1',
        isActive: true,
        lastSeenAt: null,
        lastErrorCount: 0,
      }),
      create: vi.fn().mockResolvedValue({
        id: 'device-1',
        lastSeenAt: new Date('2026-07-14T12:00:00.000Z'),
      }),
      update: vi.fn().mockResolvedValue({
        id: 'device-1',
        lastSeenAt: new Date('2026-07-14T12:00:00.000Z'),
      }),
    },
    person: {
      findMany: vi.fn().mockResolvedValue([
        { id: PERSON_ID, organizationUnitId: 'cm0000000000000000000004' },
        { id: 'cm0000000000000000000003', organizationUnitId: 'cm0000000000000000000004' },
      ]),
    },
    closingPeriod: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    terminalHeartbeat: {
      create: vi.fn().mockResolvedValue({
        id: 'heartbeat-1',
        bufferedRecords: 2,
        errorCount: 0,
      }),
    },
    timeType: {
      findMany: vi
        .fn()
        .mockImplementation(({ where: { code } }) =>
          Promise.resolve(
            code.in.map((value: string) => ({ id: `time-type-${value}`, code: value })),
          ),
        ),
    },
    booking: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    absence: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const auditHelper = {
    appendAudit: vi.fn().mockResolvedValue(undefined),
  };
  const closingLockHelper = {
    assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
    assertClosingPeriodsUnlockedForRangesInTransaction: vi.fn().mockResolvedValue(undefined),
    rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
      throw error;
    }),
  };
  const service = new TerminalGatewayService(
    prisma as never,
    auditHelper as never,
    closingLockHelper as never,
  );

  return { service, prisma, tx, auditHelper, closingLockHelper };
}

const user = {
  subject: ACTOR_ID,
  email: 'hr@example.invalid',
  role: Role.HR,
  claims: {},
};

const payload = {
  terminalId: 'terminal-1',
  records: [
    {
      personId: PERSON_ID,
      timeTypeCode: 'WORK',
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T12:00:00.000Z',
    },
  ],
};

describe('TerminalGatewayService import atomicity', () => {
  it('rejects records whose end is not after their start', () => {
    expect(
      TerminalSyncBatchSchema.safeParse({
        ...payload,
        records: [
          {
            ...payload.records[0],
            endTime: '2026-07-14T07:59:59.000Z',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('performs booking, receipt, and audit writes through one transaction client', async () => {
    const { service, prisma, tx, auditHelper, closingLockHelper } = buildService();

    const result = await service.importBatch(user, ACTOR_ID, payload);

    expect(result).toMatchObject({ batchId: 'batch-new', created: 1, duplicates: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.booking.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          personId: PERSON_ID,
          source: BookingSource.IMPORT,
        }),
      ],
    });
    expect(tx.$queryRaw.mock.calls.slice(0, 2).map((call) => call[1])).toEqual([
      'cueq:terminal-write:terminal-1',
      expect.stringMatching(/^cueq:terminal-ingestion:terminal-1:/u),
    ]);
    expect(
      closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction,
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          organizationUnitId: 'cm0000000000000000000004',
          from: new Date(payload.records[0]!.startTime),
        }),
      ],
      tx,
    );
    expect(tx.terminalSyncBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        terminalId: 'terminal-1',
        ingestionChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('preloads batch lookups while preserving terminal record outcomes and in-batch overlaps', async () => {
    const { service, tx } = buildService();
    tx.timeType.findMany.mockImplementationOnce(({ where: { code } }) =>
      Promise.resolve(
        code.in
          .filter((value: string) => value !== 'UNKNOWN')
          .map((value: string) => ({ id: `time-type-${value}`, code: value })),
      ),
    );
    tx.absence.findMany.mockResolvedValueOnce([
      {
        personId: PERSON_ID,
        startDate: new Date('2026-07-14T11:00:00.000Z'),
        endDate: new Date('2026-07-14T12:00:00.000Z'),
      },
    ]);
    tx.booking.findMany.mockResolvedValueOnce([
      {
        personId: PERSON_ID,
        timeTypeId: 'time-type-WORK',
        startTime: new Date('2026-07-14T09:00:00.000Z'),
        endTime: new Date('2026-07-14T10:00:00.000Z'),
        source: BookingSource.IMPORT,
      },
      {
        personId: PERSON_ID,
        timeTypeId: 'time-type-WORK',
        startTime: new Date('2026-07-14T13:30:00.000Z'),
        endTime: new Date('2026-07-14T14:30:00.000Z'),
        source: BookingSource.WEB,
      },
    ]);
    const records = [
      {
        personId: PERSON_ID,
        timeTypeCode: 'UNKNOWN',
        startTime: '2026-07-14T08:00:00.000Z',
        endTime: '2026-07-14T08:30:00.000Z',
      },
      {
        personId: PERSON_ID,
        timeTypeCode: 'WORK',
        startTime: '2026-07-14T09:00:00.000Z',
        endTime: '2026-07-14T10:00:00.000Z',
      },
      {
        personId: PERSON_ID,
        timeTypeCode: 'WORK',
        startTime: '2026-07-14T11:00:00.000Z',
        endTime: '2026-07-14T12:00:00.000Z',
      },
      {
        personId: PERSON_ID,
        timeTypeCode: 'WORK',
        startTime: '2026-07-14T13:00:00.000Z',
        endTime: '2026-07-14T14:00:00.000Z',
      },
      {
        personId: PERSON_ID,
        timeTypeCode: 'WORK',
        startTime: '2026-07-14T15:00:00.000Z',
        endTime: '2026-07-14T16:00:00.000Z',
      },
      {
        personId: PERSON_ID,
        timeTypeCode: 'PAUSE',
        startTime: '2026-07-14T15:30:00.000Z',
      },
    ];

    await expect(
      service.importBatch(user, ACTOR_ID, { terminalId: 'terminal-1', records }),
    ).resolves.toMatchObject({
      created: 1,
      duplicates: 1,
      unknownTimeTypes: [
        {
          personId: PERSON_ID,
          startTime: '2026-07-14T08:00:00.000Z',
          timeTypeCode: 'UNKNOWN',
        },
      ],
      conflictFlags: [
        {
          personId: PERSON_ID,
          startTime: '2026-07-14T11:00:00.000Z',
          type: 'ABSENCE_CONFLICT',
        },
        {
          personId: PERSON_ID,
          startTime: '2026-07-14T13:00:00.000Z',
          type: 'BOOKING_OVERLAP',
        },
        {
          personId: PERSON_ID,
          startTime: '2026-07-14T15:30:00.000Z',
          type: 'BOOKING_OVERLAP',
        },
      ],
    });

    expect(tx.timeType.findMany).toHaveBeenCalledTimes(1);
    expect(tx.absence.findMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.findMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.createMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            personId: { in: [PERSON_ID] },
            startTime: { lt: new Date('2026-07-14T16:00:00.000Z') },
            OR: [{ endTime: null }, { endTime: { gt: new Date('2026-07-14T09:00:00.000Z') } }],
          },
          {
            personId: { in: [PERSON_ID] },
            OR: [{ endTime: null }, { endTime: { gt: new Date('2026-07-14T15:30:00.000Z') } }],
          },
        ],
      },
      select: { personId: true, timeTypeId: true, startTime: true, endTime: true, source: true },
    });
  });

  it('keeps booking preload predicates bounded for a large structured batch', async () => {
    const { service, tx, auditHelper, closingLockHelper } = buildService();
    const actualClosingLockHelper = new ClosingLockHelper({} as never, auditHelper as never);
    closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction.mockImplementation(
      (attempts, client) =>
        actualClosingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction(
          attempts,
          client as never,
        ),
    );
    const records = Array.from({ length: 1_000 }, (_, index) => {
      const startTime = new Date(Date.UTC(2026, 6, 1, 0, index * 2));
      const endTime = new Date(startTime.getTime() + 60_000);
      return {
        personId: PERSON_ID,
        timeTypeCode: 'WORK',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };
    });

    await expect(
      service.importBatch(user, ACTOR_ID, { terminalId: 'terminal-1', records }),
    ).resolves.toMatchObject({ created: 1_000, duplicates: 0, conflictFlags: [] });

    expect(tx.timeType.findMany).toHaveBeenCalledTimes(1);
    expect(tx.absence.findMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.findMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.findMany.mock.calls[0]?.[0].where.OR).toHaveLength(1);
    expect(tx.closingPeriod.findMany).toHaveBeenCalledTimes(16);
    expect(
      tx.closingPeriod.findMany.mock.calls.every(([query]) => query.where.OR.length <= 128),
    ).toBe(true);
    expect(tx.booking.createMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ personId: PERSON_ID, source: BookingSource.IMPORT }),
      ]),
    });
    expect(tx.booking.createMany.mock.calls[0]?.[0].data).toHaveLength(1_000);
    expect(
      closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction,
    ).toHaveBeenCalledTimes(1);
  });

  it('returns the stored receipt for an exact replay without repeating writes', async () => {
    const ingestionChecksum = 'a'.repeat(64);
    const { service, tx, auditHelper } = buildService({
      totalRecords: 1,
      created: 1,
      duplicates: 0,
      conflictFlags: [],
      unknownTimeTypes: [],
      sorted: true,
      ingestionChecksum,
    });

    const result = await service.importBatch(user, ACTOR_ID, payload);

    expect(result).toMatchObject({
      batchId: 'batch-existing',
      ingestionChecksum,
      created: 0,
      duplicates: 1,
    });
    expect(tx.terminalDevice.findUnique).not.toHaveBeenCalled();
    expect(tx.booking.createMany).not.toHaveBeenCalled();
    expect(tx.terminalSyncBatch.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('does not report success when the transactional audit participant fails', async () => {
    const { service, auditHelper } = buildService();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(service.importBatch(user, ACTOR_ID, payload)).rejects.toThrow('audit unavailable');
  });

  it('does not create a receipt or report success when the bulk booking write fails', async () => {
    const { service, tx, auditHelper } = buildService();
    tx.booking.createMany.mockRejectedValueOnce(new Error('bulk booking write unavailable'));

    await expect(service.importBatch(user, ACTOR_ID, payload)).rejects.toThrow(
      'bulk booking write unavailable',
    );

    expect(tx.booking.createMany).toHaveBeenCalledTimes(1);
    expect(tx.terminalSyncBatch.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('skips the bulk booking write when every canonical record is rejected', async () => {
    const { service, tx } = buildService();
    tx.timeType.findMany.mockResolvedValueOnce([]);

    await expect(
      service.importBatch(user, ACTOR_ID, {
        terminalId: 'terminal-1',
        records: [{ ...payload.records[0]!, timeTypeCode: 'UNKNOWN' }],
      }),
    ).resolves.toMatchObject({ created: 0, unknownTimeTypes: [expect.any(Object)] });

    expect(tx.booking.createMany).not.toHaveBeenCalled();
  });

  it('uses the exact blocked canonical record for the durable closing audit', async () => {
    const { service, closingLockHelper } = buildService();
    const blockedAttempt = {
      actorId: ACTOR_ID,
      organizationUnitId: 'org-b',
      from: new Date('2026-07-14T13:00:00.000Z'),
      to: new Date('2026-07-14T14:00:00.000Z'),
      attemptedAction: 'TERMINAL_BATCH_IMPORT',
      entityType: 'TerminalSyncBatch',
      entityId: 'terminal-1:checksum',
    };
    const locked = Object.assign(new ConflictException({ code: 'CLOSING_PERIOD_LOCKED' }), {
      closingBlockedAttempt: blockedAttempt,
    });
    closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction.mockRejectedValueOnce(
      locked,
    );

    await expect(
      service.importBatch(user, ACTOR_ID, {
        terminalId: 'terminal-1',
        records: [
          payload.records[0]!,
          {
            ...payload.records[0]!,
            personId: 'cm0000000000000000000003',
            startTime: '2026-07-14T13:00:00.000Z',
            endTime: '2026-07-14T14:00:00.000Z',
          },
        ],
      }),
    ).rejects.toBe(locked);

    expect(closingLockHelper.rethrowWithDurableClosingAudit).toHaveBeenCalledWith(
      locked,
      blockedAttempt,
    );
  });

  it('uses the same ingestion identity when equal-time records arrive in another order', async () => {
    const otherPersonId = 'cm0000000000000000000003';
    const records = [
      payload.records[0]!,
      {
        ...payload.records[0]!,
        personId: otherPersonId,
        timeTypeCode: 'PAUSE',
      },
    ];
    const first = buildService();
    const second = buildService();

    await first.service.importBatch(user, ACTOR_ID, { terminalId: 'terminal-1', records });
    await second.service.importBatch(user, ACTOR_ID, {
      terminalId: 'terminal-1',
      records: [...records].reverse(),
    });

    const firstChecksum = first.tx.terminalSyncBatch.create.mock.calls[0]?.[0].data
      .ingestionChecksum as string;
    const secondChecksum = second.tx.terminalSyncBatch.create.mock.calls[0]?.[0].data
      .ingestionChecksum as string;
    expect(secondChecksum).toBe(firstChecksum);
  });
});

describe('TerminalGatewayService heartbeat integrity', () => {
  const heartbeatPayload = {
    terminalId: 'terminal-1',
    observedAt: '2026-07-14T12:00:00.000Z',
    bufferedRecords: 2,
    errorCount: 0,
  };

  it('writes the device state, heartbeat, and audit in one transaction', async () => {
    const { service, prisma, tx, auditHelper } = buildService();

    await expect(service.recordHeartbeat('dev-terminal-token', heartbeatPayload)).resolves.toEqual({
      id: 'heartbeat-1',
      terminalId: 'terminal-1',
      observedAt: heartbeatPayload.observedAt,
      bufferedRecords: 2,
      errorCount: 0,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.terminalHeartbeat.create).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('checks the integration token before parsing a heartbeat or touching persistence', async () => {
    const { service, prisma } = buildService();

    await expect(service.recordHeartbeat(undefined, { malformed: true })).rejects.toThrow();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a delayed heartbeat without regressing the device last-seen state', async () => {
    const { service, tx } = buildService();
    tx.terminalDevice.findUnique.mockResolvedValueOnce({
      id: 'device-1',
      isActive: true,
      lastSeenAt: new Date('2026-07-14T13:00:00.000Z'),
      lastErrorCount: 4,
    });

    await service.recordHeartbeat('dev-terminal-token', heartbeatPayload);

    expect(tx.terminalDevice.update).not.toHaveBeenCalled();
    expect(tx.terminalHeartbeat.create).toHaveBeenCalledTimes(1);
  });

  it('rejects heartbeats from unregistered or inactive terminal IDs', async () => {
    const { service, tx, auditHelper } = buildService();
    tx.terminalDevice.findUnique.mockResolvedValueOnce(null);

    await expect(service.recordHeartbeat('dev-terminal-token', heartbeatPayload)).rejects.toThrow(
      'Active terminal device registration not found.',
    );
    expect(tx.terminalDevice.create).not.toHaveBeenCalled();
    expect(tx.terminalHeartbeat.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('rolls back the heartbeat participant when its audit fails', async () => {
    const { service, auditHelper } = buildService();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(service.recordHeartbeat('dev-terminal-token', heartbeatPayload)).rejects.toThrow(
      'audit unavailable',
    );
  });
});
