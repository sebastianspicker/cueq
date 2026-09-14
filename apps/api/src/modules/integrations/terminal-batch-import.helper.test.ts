import { ConflictException } from '@nestjs/common';
import { BookingSource, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { importTerminalBatch } from './terminal-batch-import.helper.js';

const ids = {
  actor: 'c00000000000000000000001',
  person: 'c00000000000000000000002',
  assignment: 'c00000000000000000000003',
  timeType: 'c00000000000000000000004',
  organizationUnit: 'c00000000000000000000005',
};

const record = {
  personId: ids.person,
  timeTypeCode: 'WORK',
  startTime: '2026-08-04T08:00:00.000Z',
  endTime: '2026-08-04T09:00:00.000Z',
};

function setup(existingBookings: object[] = []) {
  const resolved = {
    assignment: { id: ids.assignment, personId: ids.person },
    organizationUnitId: ids.organizationUnit,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    terminalSyncBatch: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'batch-1' }),
    },
    terminalDevice: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'device-1' }),
    },
    timeType: {
      findMany: vi.fn().mockResolvedValue([{ id: ids.timeType, code: 'WORK' }]),
    },
    absence: { findMany: vi.fn().mockResolvedValue([]) },
    booking: {
      findMany: vi.fn().mockResolvedValue(existingBookings),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const assignmentHelper = {
    resolveInterval: vi.fn().mockResolvedValue(resolved),
    assertUnchanged: vi.fn().mockResolvedValue(resolved),
  };
  const closingLockHelper = {
    assertClosingPeriodsUnlockedForRangesInTransaction: vi.fn().mockResolvedValue(undefined),
    rethrowWithDurableClosingAudit: vi.fn(),
  };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
  const user = {
    subject: 'test',
    email: 'hr@example.test',
    role: Role.HR,
    claims: {},
  };

  return {
    tx,
    assignmentHelper,
    closingLockHelper,
    dependencies: { prisma, assignmentHelper, closingLockHelper, auditHelper } as never,
    user,
  };
}

describe('terminal batch appointment scope', () => {
  it('infers one eligible appointment, checks its effective unit, and persists its id', async () => {
    const context = setup();

    await expect(
      importTerminalBatch(context.dependencies, context.user, ids.actor, {
        terminalId: 'terminal-1',
        records: [record],
      }),
    ).resolves.toMatchObject({ created: 1, conflictFlags: [] });

    expect(context.assignmentHelper.resolveInterval).toHaveBeenCalledWith(
      ids.person,
      new Date(record.startTime),
      new Date(record.endTime),
      undefined,
      context.tx,
    );
    expect(
      context.closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction,
    ).toHaveBeenCalledWith(
      [expect.objectContaining({ organizationUnitId: ids.organizationUnit })],
      context.tx,
    );
    expect(context.tx.booking.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ assignmentId: ids.assignment, personId: ids.person })],
    });
  });

  it('preserves person-wide overlap conflicts across appointments', async () => {
    const context = setup([
      {
        personId: ids.person,
        timeTypeId: 'other-time-type',
        startTime: new Date('2026-08-04T08:30:00.000Z'),
        endTime: new Date('2026-08-04T08:45:00.000Z'),
        source: BookingSource.WEB,
      },
    ]);

    await expect(
      importTerminalBatch(context.dependencies, context.user, ids.actor, {
        terminalId: 'terminal-1',
        records: [{ ...record, assignmentId: ids.assignment }],
      }),
    ).resolves.toMatchObject({
      created: 0,
      conflictFlags: [{ personId: ids.person, type: 'BOOKING_OVERLAP' }],
    });
    expect(context.tx.booking.createMany).not.toHaveBeenCalled();
  });

  it('propagates ambiguous appointment selection before closing or booking writes', async () => {
    const context = setup();
    const error = new ConflictException({ code: 'ASSIGNMENT_REQUIRED' });
    context.assignmentHelper.resolveInterval.mockRejectedValue(error);

    await expect(
      importTerminalBatch(context.dependencies, context.user, ids.actor, {
        terminalId: 'terminal-1',
        records: [record],
      }),
    ).rejects.toBe(error);
    expect(
      context.closingLockHelper.assertClosingPeriodsUnlockedForRangesInTransaction,
    ).not.toHaveBeenCalled();
    expect(context.tx.booking.createMany).not.toHaveBeenCalled();
  });
});
