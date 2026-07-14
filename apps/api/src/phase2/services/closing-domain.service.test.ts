import { ClosingStatus } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ClosingDomainService } from './closing-domain.service';

describe('ClosingDomainService automatic cutoff resilience', () => {
  it('continues with later periods when one period lock is busy', async () => {
    const periods = ['closing-busy', 'closing-ready'].map((id) => ({
      id,
      status: ClosingStatus.OPEN,
      organizationUnitId: null,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
    }));
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ acquired: false }])
        .mockResolvedValueOnce([{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn().mockResolvedValue(periods[1]),
        update: vi.fn().mockResolvedValue({}),
      },
      auditEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue(periods) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue('system-actor'),
      appendAudit: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z'))).resolves.toEqual({
      enabled: true,
      evaluated: 2,
      transitioned: 1,
      busy: 1,
    });
    expect(tx.closingPeriod.update).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledTimes(1);
  });

  it('does not transition a due period without a durable audit actor', async () => {
    const period = {
      id: 'closing-due',
      status: ClosingStatus.OPEN,
      organizationUnitId: null,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
    };
    const prisma = {
      closingPeriod: { findMany: vi.fn().mockResolvedValue([period]) },
      $transaction: vi.fn(),
    };
    const auditHelper = {
      resolveSystemActorId: vi.fn().mockResolvedValue(null),
      appendAudit: vi.fn(),
    };
    const service = new ClosingDomainService(
      prisma as never,
      {} as never,
      auditHelper as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.runClosingCutoff(new Date('2026-07-14T12:00:00.000Z')),
    ).rejects.toMatchObject({
      response: { code: 'CLOSING_SYSTEM_ACTOR_UNAVAILABLE' },
      status: 503,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });
});
