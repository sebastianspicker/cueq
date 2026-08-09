export type WebhookDispatchCounters = {
  processed: number;
  delivered: number;
  failed: number;
  skipped: number;
  configurationFaults: number;
};

export type WebhookDispatchOutcome =
  | 'UNCLAIMED'
  | 'DELIVERED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CONFIGURATION_FAULT';

type OutboxListEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
};

type WebhookDeliveryListRecord = {
  id: string;
  outboxEventId: string;
  endpointId: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

export function emptyWebhookDispatchCounters(): WebhookDispatchCounters {
  return { processed: 0, delivered: 0, failed: 0, skipped: 0, configurationFaults: 0 };
}

export function recordWebhookDispatchOutcome(
  counters: WebhookDispatchCounters,
  outcome: WebhookDispatchOutcome,
): void {
  if (outcome === 'UNCLAIMED') return;
  counters.processed += 1;
  if (outcome === 'DELIVERED') counters.delivered += 1;
  if (outcome === 'FAILED') counters.failed += 1;
  if (outcome === 'SKIPPED') counters.skipped += 1;
  if (outcome === 'CONFIGURATION_FAULT') counters.configurationFaults += 1;
}

export function mapOutboxEvents(events: OutboxListEvent[]) {
  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    status: event.status,
    attempts: event.attempts,
    nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
    lastError: event.lastError,
    processedAt: event.processedAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
  }));
}

export function mapWebhookDeliveries(deliveries: WebhookDeliveryListRecord[]) {
  return deliveries.map((delivery) => ({
    id: delivery.id,
    outboxEventId: delivery.outboxEventId,
    endpointId: delivery.endpointId,
    attempt: delivery.attempt,
    status: delivery.status,
    httpStatus: delivery.httpStatus,
    responseBody: delivery.responseBody,
    error: delivery.error,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  }));
}
import type { OutboxStatus, WebhookDeliveryStatus } from '@cueq/database';
