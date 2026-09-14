/** Bounded keyset scan for open closing periods considered by the cutoff scheduler. */
import { ClosingStatus } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';

const CLOSING_CUTOFF_SCAN_BATCH_SIZE = 100;

export type ClosingCutoffCandidate = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  organizationUnitId: string | null;
};

export async function scanOpenClosingPeriods(
  prisma: Pick<PrismaService, 'closingPeriod'>,
  visitPage: (periods: ClosingCutoffCandidate[]) => Promise<void>,
): Promise<number> {
  let evaluated = 0;
  let cursor: Pick<ClosingCutoffCandidate, 'id' | 'periodStart'> | undefined;

  while (true) {
    const periods = await prisma.closingPeriod.findMany({
      where: {
        status: ClosingStatus.OPEN,
        ...(cursor
          ? {
              OR: [
                { periodStart: { gt: cursor.periodStart } },
                { periodStart: cursor.periodStart, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: { id: true, periodStart: true, periodEnd: true, organizationUnitId: true },
      orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
      take: CLOSING_CUTOFF_SCAN_BATCH_SIZE,
    });

    evaluated += periods.length;
    await visitPage(periods);

    const last = periods.at(-1);
    if (periods.length < CLOSING_CUTOFF_SCAN_BATCH_SIZE || !last) break;
    cursor = { id: last.id, periodStart: last.periodStart };
  }

  return evaluated;
}
