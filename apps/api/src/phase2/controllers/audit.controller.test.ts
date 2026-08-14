import { Role } from '@cueq/database';
import { AuditEntriesQuerySchema } from '@cueq/shared';
import { describe, expect, it, vi } from 'vitest';
import { AuditController } from './audit.controller.js';

const user = {
  subject: 'hr-1',
  email: 'hr@example.invalid',
  role: Role.HR,
  claims: {},
};

function createFixture({ entries = [], total = 0 }: { entries?: unknown[]; total?: number } = {}) {
  const auditEntry = {
    findMany: vi.fn().mockResolvedValue(entries),
    count: vi.fn().mockResolvedValue(total),
  };

  return {
    auditEntry,
    controller: new AuditController({ auditEntry } as never),
  };
}

describe('AuditController', () => {
  it('uses schema defaults with no filters and serializes timestamps', async () => {
    const timestamp = new Date('2026-08-11T09:10:11.000Z');
    const { auditEntry, controller } = createFixture({
      entries: [
        {
          id: 'audit-1',
          timestamp,
          actorId: 'person-1',
          action: 'BOOKING_CREATED',
          entityType: 'Booking',
          entityId: 'booking-1',
          reason: null,
        },
      ],
      total: 1,
    });

    await expect(
      controller.listAuditEntries(user, AuditEntriesQuerySchema.parse({})),
    ).resolves.toEqual({
      items: [
        {
          id: 'audit-1',
          timestamp: '2026-08-11T09:10:11.000Z',
          actorId: 'person-1',
          action: 'BOOKING_CREATED',
          entityType: 'Booking',
          entityId: 'booking-1',
          reason: null,
        },
      ],
      total: 1,
      skip: 0,
      take: 50,
    });

    expect(auditEntry.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { timestamp: 'desc' },
      skip: 0,
      take: 50,
      select: {
        id: true,
        timestamp: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
      },
    });
    expect(auditEntry.count).toHaveBeenCalledWith({ where: {} });
  });

  it('uses all exact filters, date bounds, and matching count filters', async () => {
    const { auditEntry, controller } = createFixture({ total: 3 });
    const query = AuditEntriesQuerySchema.parse({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-10T23:59:59.999Z',
      action: 'BOOKING_APPROVED',
      entityType: 'Booking',
      actorId: 'clyz1234567890abcdef1234',
      entityId: 'clyzabcdefghijklmno1234567',
      skip: 25,
      take: 10,
    });

    await expect(controller.listAuditEntries(user, query)).resolves.toMatchObject({
      items: [],
      total: 3,
      skip: 25,
      take: 10,
    });

    const expectedWhere = {
      timestamp: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-10T23:59:59.999Z'),
      },
      action: 'BOOKING_APPROVED',
      entityType: 'Booking',
      actorId: 'clyz1234567890abcdef1234',
      entityId: 'clyzabcdefghijklmno1234567',
    };
    expect(auditEntry.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { timestamp: 'desc' },
      skip: 25,
      take: 10,
      select: {
        id: true,
        timestamp: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
      },
    });
    expect(auditEntry.count).toHaveBeenCalledWith({ where: expectedWhere });
  });
});
