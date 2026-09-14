import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { scanOpenClosingPeriods, type ClosingCutoffCandidate } from './closing-cutoff-scan.js';

describe('closing cutoff scanning', () => {
  it('visits open periods in bounded keyset pages', async () => {
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const candidates = Array.from({ length: 205 }, (_, index) => ({
      id: `period-${String(index).padStart(3, '0')}`,
      periodStart,
      periodEnd: new Date('2026-01-31T23:59:59.999Z'),
      organizationUnitId: null,
    }));
    let offset = 0;
    const findMany = vi.fn(async (_args: unknown) => {
      const page = candidates.slice(offset, offset + 100);
      offset += page.length;
      return page;
    });
    const visitPage = vi.fn(async (_page: ClosingCutoffCandidate[]) => undefined);

    await expect(
      scanOpenClosingPeriods(
        { closingPeriod: { findMany } } as unknown as Pick<PrismaService, 'closingPeriod'>,
        visitPage,
      ),
    ).resolves.toBe(205);

    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [{ periodStart: { gt: periodStart } }, { periodStart, id: { gt: 'period-099' } }],
      },
    });
    expect(visitPage.mock.calls.map(([page]) => page.length)).toEqual([100, 100, 5]);
  });
});
