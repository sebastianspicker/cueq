import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { PersonnelQueryService } from './personnel-query.service.js';
import { PersonnelReconciliationController } from './personnel-reconciliation.controller.js';

const ids = {
  actor: 'c00000000000000000000301',
  allowed: 'c00000000000000000000302',
  hidden: 'c00000000000000000000303',
};

describe('personnel list scoping', () => {
  it('applies explicit personnel scope before directory pagination', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: ids.allowed,
        firstName: 'Ada',
        lastName: 'Lovelace',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const service = new PersonnelQueryService({ $queryRaw: queryRaw } as unknown as PrismaService);

    const result = await service.directory(ids.actor, { search: 'Ada', limit: 2 });

    expect(result.items.map((item) => item.id)).toEqual([ids.allowed]);
    const query = queryRaw.mock.calls[0]?.[0] as { sql?: string; values?: unknown[] };
    expect(query.sql).toContain('capability_grants');
    expect(query.sql).toContain('ORDER BY p."createdAt", p.id LIMIT');
    expect(query.values).toContain(ids.actor);
    expect(query.values).toContain('%Ada%');
  });

  it('loads change rows only from capability-filtered identifiers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: ids.allowed }]);
    const findMany = vi.fn().mockResolvedValue([
      {
        id: ids.allowed,
        personId: ids.allowed,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const service = new PersonnelQueryService({
      $queryRaw: queryRaw,
      profileChangeRequest: { findMany },
    } as unknown as PrismaService);

    const result = await service.changes(ids.actor, { limit: 10 });

    expect(result.items.map((item) => item.id)).toEqual([ids.allowed]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [ids.allowed] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const query = queryRaw.mock.calls[0]?.[0] as { values?: unknown[] };
    expect(query.values).toContain('profile.approve');
    expect(query.values).toContain('profile.request');
  });

  it('does not call source-list storage when global reconciliation access is denied', async () => {
    const sources = vi.fn();
    const controller = new PersonnelReconciliationController(
      { personForUser: vi.fn().mockResolvedValue({ id: ids.actor }) } as never,
      { sources } as never,
      {
        assertGlobal: vi.fn().mockRejectedValue(new ForbiddenException('explicit grant required')),
      } as never,
    );

    await expect(
      controller.list(
        { subject: ids.actor, email: 'actor@example.test', role: 'HR', claims: {} } as never,
        {},
      ),
    ).rejects.toThrow('explicit grant required');
    expect(sources).not.toHaveBeenCalled();
  });
});
