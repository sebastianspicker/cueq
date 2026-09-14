import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { escalateOverdueWorkflows } from './workflow-assignment-escalation.js';

describe('workflow escalation scanning', () => {
  it('reads overdue candidates in bounded keyset pages and retains fresh per-item checks', async () => {
    const dueAt = new Date('2026-09-01T00:00:00.000Z');
    const candidates = Array.from({ length: 205 }, (_, index) => ({
      id: `workflow-${String(index).padStart(3, '0')}`,
      dueAt,
      escalationLevel: 0,
    }));
    let offset = 0;
    const findMany = vi.fn(async (_args: unknown) => {
      const page = candidates.slice(offset, offset + 100);
      offset += page.length;
      return page;
    });
    const findUnique = vi.fn(async () => null);
    const prisma = {
      workflowInstance: { findMany },
      $transaction: async <T>(operation: (tx: unknown) => Promise<T>) =>
        operation({
          $queryRaw: async () => [{ acquired: true }],
          workflowInstance: { findUnique },
        }),
    } as unknown as Pick<PrismaService, '$transaction' | 'workflowInstance'>;

    await expect(
      escalateOverdueWorkflows(prisma, { appendAudit: vi.fn() }, new Date('2026-09-02T00:00:00Z')),
    ).resolves.toEqual({ escalated: 0 });

    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      select: { id: true, dueAt: true, escalationLevel: true },
      take: 100,
    });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { OR: [{ dueAt: { gt: dueAt } }, { dueAt, id: { gt: 'workflow-099' } }] },
    });
    expect(findUnique).toHaveBeenCalledTimes(205);
  });
});
