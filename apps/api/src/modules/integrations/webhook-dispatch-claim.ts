import { ConflictException } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { DeliveryRecord } from './webhook-delivery.mapper.js';

const WEBHOOK_CONFIGURATION_RETRY_DELAY_MS = 5 * 60_000;

export type DispatchableOutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  createdAt: Date;
};

type ClaimableOutboxEvent = Pick<DispatchableOutboxEvent, 'id' | 'status' | 'attempts'>;
type OutboxStore = Pick<PrismaService, 'domainEventOutbox'>;

export async function claimWebhookEvent(
  outbox: OutboxStore,
  event: DispatchableOutboxEvent,
  now: Date,
  claimLeaseMs: number,
): Promise<Date | null> {
  const claimUntil = new Date(Date.now() + claimLeaseMs);
  const claim = await outbox.domainEventOutbox.updateMany({
    where: {
      id: event.id,
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      attempts: event.attempts,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: { nextAttemptAt: claimUntil },
  });
  return claim.count === 1 ? claimUntil : null;
}

export async function renewWebhookClaim(
  outbox: OutboxStore,
  event: ClaimableOutboxEvent,
  currentLease: Date,
  claimLeaseMs: number,
): Promise<Date> {
  const nextLease = new Date(Date.now() + claimLeaseMs);
  const renewed = await outbox.domainEventOutbox.updateMany({
    where: {
      id: event.id,
      status: event.status,
      attempts: event.attempts,
      nextAttemptAt: currentLease,
    },
    data: { nextAttemptAt: nextLease },
  });
  if (renewed.count !== 1) {
    throw new ConflictException('Webhook dispatch claim expired before it was renewed.');
  }
  return nextLease;
}

export async function releaseWebhookClaimForConfigurationFault(
  outbox: OutboxStore,
  event: ClaimableOutboxEvent,
  claimUntil: Date,
  configurationError: string,
): Promise<void> {
  const released = await outbox.domainEventOutbox.updateMany({
    where: {
      id: event.id,
      status: event.status,
      attempts: event.attempts,
      nextAttemptAt: claimUntil,
    },
    data: {
      lastError: configurationError,
      nextAttemptAt: new Date(Date.now() + WEBHOOK_CONFIGURATION_RETRY_DELAY_MS),
    },
  });
  if (released.count !== 1) {
    throw new ConflictException('Webhook dispatch claim expired before it was released.');
  }
}

async function finalizeWebhookEvent(
  outbox: OutboxStore,
  event: ClaimableOutboxEvent,
  claimUntil: Date,
  data: Record<string, unknown>,
): Promise<void> {
  const finalized = await outbox.domainEventOutbox.updateMany({
    where: {
      id: event.id,
      status: event.status,
      attempts: event.attempts,
      nextAttemptAt: claimUntil,
    },
    data,
  });
  if (finalized.count !== 1) {
    throw new ConflictException('Webhook dispatch claim expired before it was finalized.');
  }
}

export async function finalizeSkippedWebhookEvent(
  outbox: OutboxStore,
  event: DispatchableOutboxEvent,
  claimUntil: Date,
  now: Date,
): Promise<void> {
  await finalizeWebhookEvent(outbox, event, claimUntil, {
    status: OutboxStatus.SKIPPED,
    attempts: event.attempts + 1,
    processedAt: now,
    lastError: null,
    nextAttemptAt: null,
  });
}

function retryWebhookDeliveryAt(attempt: number, maxAttempts: number): Date | null {
  if (attempt >= maxAttempts) return null;
  return new Date(Date.now() + 2 ** Math.min(attempt, 6) * 60_000);
}

export async function finalizeWebhookDeliveries(
  prisma: Pick<PrismaService, '$transaction'>,
  event: DispatchableOutboxEvent,
  claimUntil: Date,
  delivery: { eventFailed: boolean; lastError: string | null; records: DeliveryRecord[] },
  maxAttempts: number,
): Promise<void> {
  const attempt = event.attempts + 1;
  const data = delivery.eventFailed
    ? {
        status: OutboxStatus.FAILED,
        attempts: attempt,
        processedAt: null,
        lastError: delivery.lastError,
        nextAttemptAt: retryWebhookDeliveryAt(attempt, maxAttempts),
      }
    : {
        status: OutboxStatus.DELIVERED,
        attempts: attempt,
        processedAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      };
  await prisma.$transaction(async (tx) => {
    await finalizeWebhookEvent(tx, event, claimUntil, data);
    if (delivery.records.length > 0) {
      await tx.webhookDelivery.createMany({ data: delivery.records });
    }
  });
}
