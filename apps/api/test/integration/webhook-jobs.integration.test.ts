import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@cueq/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { finalizeJobItem } from '../../src/modules/integrations/webhook-job-ownership.js';

const prisma = new PrismaClient();
beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

it('fences a replaced worker and atomically records each finite item once', async () => {
  const rollback = new Error('ROLLBACK_SYNTHETIC_JOB');
  await expect(
    prisma.$transaction(async (tx) => {
      const event = await tx.domainEventOutbox.create({
        data: { eventType: 'test', aggregateType: 'test', aggregateId: randomUUID(), payload: {} },
      });
      const job = await tx.webhookDispatchJob.create({
        data: {
          status: 'RUNNING',
          total: 1,
          owner: 'new-worker',
          generation: 2,
          requestedById: 'synthetic-test',
          leaseUntil: new Date(Date.now() + 60_000),
          settings: {},
          items: { create: { eventId: event.id, position: 0 } },
        },
        include: { items: true },
      });
      const item = job.items[0]!;
      const ownership = { id: job.id, owner: 'new-worker', generation: 2 };
      await expect(
        finalizeJobItem(
          tx,
          { ...ownership, owner: 'old-worker', generation: 1 },
          60_000,
          item.id,
          'FAILED',
        ),
      ).rejects.toThrow('ownership expired');
      expect(
        (await tx.webhookDispatchJob.findUniqueOrThrow({ where: { id: job.id } })).processed,
      ).toBe(0);
      await finalizeJobItem(tx, ownership, 60_000, item.id, 'FAILED');
      await expect(finalizeJobItem(tx, ownership, 60_000, item.id, 'FAILED')).rejects.toThrow(
        'already finalized',
      );
      expect(
        await tx.webhookDispatchJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({ processed: 1, failed: 1, delivered: 0 });
      expect(
        await tx.webhookDispatchJobItem.findUniqueOrThrow({ where: { id: item.id } }),
      ).toMatchObject({ outcome: 'FAILED', eventId: event.id, position: 0 });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
