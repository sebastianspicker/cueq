import { createHmac } from 'node:crypto';

export const WEBHOOK_RESPONSE_BODY_MAX_BYTES = 8_000;
export const WEBHOOK_ERROR_MAX_CHARS = 1_000;

export type WebhookEnvelopeEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  createdAt: Date;
};

export function webhookEnvelope(event: WebhookEnvelopeEvent) {
  const payload =
    typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : { payload: event.payload };
  return {
    eventId: event.id,
    eventType: event.eventType,
    timestamp: event.createdAt.toISOString(),
    version: 1,
    source: 'cueq-api',
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload,
  };
}

export function webhookHeaders(
  eventType: string,
  secret: string,
  body: string,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Cueq-Event-Type': eventType,
    'X-Cueq-Signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  };
}

export function truncateForStorage(value: string | null, maxChars: number): string | null {
  if (value === null || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...[truncated]`;
}

export function webhookDispatchError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Webhook ')) return error.message;
  return 'Webhook delivery request failed.';
}
