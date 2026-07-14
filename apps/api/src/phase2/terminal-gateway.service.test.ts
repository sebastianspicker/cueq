import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { TerminalGatewayService, TerminalSyncBatchSchema } from './terminal-gateway.service';

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
      findUnique: vi.fn().mockResolvedValue(null),
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
    terminalHeartbeat: {
      create: vi.fn().mockResolvedValue({
        id: 'heartbeat-1',
        bufferedRecords: 2,
        errorCount: 0,
      }),
    },
    timeType: {
      findUnique: vi.fn().mockResolvedValue({ id: 'time-type-1' }),
    },
    booking: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'booking-1' }),
    },
    absence: {
      findFirst: vi.fn().mockResolvedValue(null),
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
    expect(tx.booking.create).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls.slice(0, 2).map((call) => call[1])).toEqual([
      'cueq:terminal-write:terminal-1',
      expect.stringMatching(/^cueq:terminal-ingestion:terminal-1:/u),
    ]);
    expect(closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationUnitId: 'cm0000000000000000000004',
        from: new Date(payload.records[0]!.startTime),
      }),
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
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(tx.terminalSyncBatch.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('does not report success when the transactional audit participant fails', async () => {
    const { service, auditHelper } = buildService();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(service.importBatch(user, ACTOR_ID, payload)).rejects.toThrow('audit unavailable');
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

  it('records a delayed heartbeat without regressing the device last-seen state', async () => {
    const { service, tx } = buildService();
    tx.terminalDevice.findUnique.mockResolvedValueOnce({
      id: 'device-1',
      lastSeenAt: new Date('2026-07-14T13:00:00.000Z'),
      lastErrorCount: 4,
    });

    await service.recordHeartbeat('dev-terminal-token', heartbeatPayload);

    expect(tx.terminalDevice.update).not.toHaveBeenCalled();
    expect(tx.terminalHeartbeat.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back the heartbeat participant when its audit fails', async () => {
    const { service, auditHelper } = buildService();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(service.recordHeartbeat('dev-terminal-token', heartbeatPayload)).rejects.toThrow(
      'audit unavailable',
    );
  });
});
