import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { WebhookDispatchOutcome } from './webhook-dispatch-output.js';

export type JobOwnership = { id: string; owner: string; generation: number };

export async function renewJobOwnership(
  tx: Pick<Prisma.TransactionClient, 'webhookDispatchJob'>,
  ownership: JobOwnership,
  leaseMs: number,
) {
  const result = await tx.webhookDispatchJob.updateMany({
    where: { ...ownership, status: 'RUNNING', leaseUntil: { gt: new Date() } },
    data: { leaseUntil: new Date(Date.now() + leaseMs) },
  });
  if (result.count !== 1) throw new ConflictException('Dispatch worker ownership expired.');
}

/** The owning job row is locked before outcome, counters, and event finalization commit. */
export async function finalizeJobItem(
  tx: Prisma.TransactionClient,
  ownership: JobOwnership,
  leaseMs: number,
  itemId: string,
  outcome: WebhookDispatchOutcome,
) {
  if (outcome === 'UNCLAIMED') throw new ConflictException('Event is still claimed.');
  await renewJobOwnership(tx, ownership, leaseMs);
  const result = await tx.webhookDispatchJobItem.updateMany({
    where: { id: itemId, jobId: ownership.id, outcome: null },
    data: { outcome, completedAt: new Date() },
  });
  if (result.count !== 1) throw new ConflictException('Dispatch item already finalized.');
  const counters = {
    delivered: outcome === 'DELIVERED' ? 1 : 0,
    failed: outcome === 'FAILED' ? 1 : 0,
    skipped: outcome === 'SKIPPED' ? 1 : 0,
    configurationFaults: outcome === 'CONFIGURATION_FAULT' ? 1 : 0,
  };
  await tx.webhookDispatchJob.update({
    where: { id: ownership.id },
    data: {
      processed: { increment: 1 },
      delivered: { increment: counters.delivered },
      failed: { increment: counters.failed },
      skipped: { increment: counters.skipped },
      configurationFaults: { increment: counters.configurationFaults },
      failureCode: null,
    },
  });
}
