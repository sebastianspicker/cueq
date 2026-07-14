import { ConflictException } from '@nestjs/common';
import { ClosingStatus } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ClosingLockHelper } from '../closing-lock.helper';

describe('ClosingLockHelper race audit', () => {
  it('persists a blocked-attempt audit after the decisive transaction rolls back', async () => {
    const period = {
      id: 'closing-1',
      status: ClosingStatus.REVIEW,
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-31T23:59:59.999Z'),
      lockedAt: new Date('2026-08-01T00:00:00.000Z'),
      lockSource: 'AUTO_CUTOFF',
    };
    const prisma = { closingPeriod: { findFirst: vi.fn().mockResolvedValue(period) } };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new ClosingLockHelper(prisma as never, auditHelper as never);
    const conflict = new ConflictException({
      code: 'CLOSING_PERIOD_LOCKED',
      closingPeriodId: period.id,
      status: 'REVIEW',
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      lockSource: period.lockSource,
    });

    await expect(
      helper.rethrowWithDurableClosingAudit(conflict, {
        actorId: 'actor-1',
        organizationUnitId: 'ou-1',
        from: new Date('2026-07-14T08:00:00.000Z'),
        to: new Date('2026-07-14T12:00:00.000Z'),
        attemptedAction: 'BOOKING_CREATE',
        entityType: 'Booking',
        entityId: 'actor-1:2026-07-14T08:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'CLOSING_PERIOD_LOCKED' } });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLOSING_LOCK_BLOCKED',
        after: expect.objectContaining({ closingPeriodId: period.id, status: 'REVIEW' }),
      }),
    );
  });

  it('uses the captured conflict when the period reopens before the durable audit', async () => {
    const prisma = { closingPeriod: { findFirst: vi.fn().mockResolvedValue(null) } };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new ClosingLockHelper(prisma as never, auditHelper as never);
    const conflict = new ConflictException({
      code: 'CLOSING_PERIOD_LOCKED',
      closingPeriodId: 'closing-reopened',
      status: 'APPROVED',
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-31T23:59:59.999Z',
      lockSource: 'MANUAL',
    });

    await expect(
      helper.rethrowWithDurableClosingAudit(conflict, {
        actorId: 'actor-1',
        organizationUnitId: 'ou-1',
        from: new Date('2026-07-14T08:00:00.000Z'),
        to: new Date('2026-07-14T12:00:00.000Z'),
        attemptedAction: 'BOOKING_CREATE',
        entityType: 'Booking',
        entityId: 'actor-1:2026-07-14T08:00:00.000Z',
      }),
    ).rejects.toBe(conflict);

    expect(prisma.closingPeriod.findFirst).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLOSING_LOCK_BLOCKED',
        after: expect.objectContaining({ closingPeriodId: 'closing-reopened' }),
      }),
    );
  });
});
