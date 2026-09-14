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
