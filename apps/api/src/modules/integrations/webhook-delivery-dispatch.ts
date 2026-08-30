import type { PrismaService } from '../../persistence/prisma.service.js';
import type { decryptWebhookSigningSecret } from './webhooks/webhook-secret-envelope.js';
import type { postWebhook } from './webhooks/webhook-http-client.js';
import {
  webhookDispatchError,
  webhookEnvelope,
  webhookHeaders,
  WEBHOOK_RESPONSE_BODY_MAX_BYTES,
} from './webhook-dispatch-format.js';
import {
  failedWebhookDeliveryRecord,
  webhookDeliveryRecord,
  type DeliveryRecord,
} from './webhook-delivery.mapper.js';
import type { DispatchableOutboxEvent } from './webhook-dispatch-claim.js';

export type DeliveryEndpoint = { id: string; url: string; secretRef: string | null };

export type WebhookDeliveryResult = {
  claimUntil: Date;
  eventFailed: boolean;
  lastError: string | null;
  records: DeliveryRecord[];
};

export function activeEndpointsForEvent(
  webhookEndpoint: Pick<PrismaService, 'webhookEndpoint'>['webhookEndpoint'],
  eventType: string,
): Promise<DeliveryEndpoint[]> {
  return webhookEndpoint.findMany({
    where: { isActive: true, subscribedEvents: { has: eventType } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function deliveryTargets(
  webhookDelivery: Pick<PrismaService, 'webhookDelivery'>['webhookDelivery'],
  eventId: string,
  endpoints: DeliveryEndpoint[],
): Promise<DeliveryEndpoint[]> {
  const successfulDeliveries = await webhookDelivery.findMany({
    where: {
      outboxEventId: eventId,
      status: 'SUCCESS',
      endpointId: { in: endpoints.map((endpoint) => endpoint.id) },
    },
    select: { endpointId: true },
  });
  const successfulEndpointIds = new Set(
    successfulDeliveries.map((delivery) => delivery.endpointId),
  );
  return endpoints.filter((endpoint) => !successfulEndpointIds.has(endpoint.id));
}

export function signingSecretsForTargets(
  endpoints: DeliveryEndpoint[],
  decrypt: typeof decryptWebhookSigningSecret,
  configurationError: string,
): Map<string, string> | null {
  const signingSecrets = new Map<string, string>();
  try {
    for (const endpoint of endpoints) {
      if (!endpoint.secretRef) throw new Error(configurationError);
      signingSecrets.set(endpoint.id, decrypt(endpoint.secretRef, endpoint.id));
    }
    return signingSecrets;
  } catch {
    return null;
  }
}

export async function deliverWebhookTargets(input: {
  event: DispatchableOutboxEvent;
  endpoints: DeliveryEndpoint[];
  signingSecrets: Map<string, string>;
  initialClaimUntil: Date;
  timeoutMs: number;
  configurationError: string;
  renewClaim: (currentLease: Date) => Promise<Date>;
  post: typeof postWebhook;
}): Promise<WebhookDeliveryResult> {
  const { event, endpoints, signingSecrets, timeoutMs, configurationError, renewClaim, post } =
    input;
  const body = JSON.stringify(webhookEnvelope(event));
  const attempt = event.attempts + 1;
  let claimUntil = input.initialClaimUntil;
  const records: DeliveryRecord[] = [];
  let lastError: string | null = null;

  for (const endpoint of endpoints) {
    claimUntil = await renewClaim(claimUntil);
    const record = await deliverWebhookTarget({
      event,
      endpoint,
      signingSecrets,
      body,
      attempt,
      timeoutMs,
      configurationError,
      post,
    });
    records.push(record);
    if (record.status === 'FAILED') lastError = record.error ?? 'Webhook delivery failed';
  }

  return { claimUntil, eventFailed: lastError !== null, lastError, records };
}

async function deliverWebhookTarget(input: {
  event: DispatchableOutboxEvent;
  endpoint: DeliveryEndpoint;
  signingSecrets: Map<string, string>;
  body: string;
  attempt: number;
  timeoutMs: number;
  configurationError: string;
  post: typeof postWebhook;
}): Promise<DeliveryRecord> {
  const { event, endpoint, signingSecrets, body, attempt, timeoutMs, configurationError, post } =
    input;
  try {
    const signingSecret = signingSecrets.get(endpoint.id);
    if (!signingSecret) throw new Error(configurationError);
    const response = await post({
      url: endpoint.url,
      headers: webhookHeaders(event.eventType, signingSecret, body),
      body,
      timeoutMs,
      maxResponseBytes: WEBHOOK_RESPONSE_BODY_MAX_BYTES,
    });
    return webhookDeliveryRecord(event.id, endpoint.id, attempt, response.status, response.body);
  } catch (error) {
    return failedWebhookDeliveryRecord(event.id, endpoint.id, attempt, webhookDispatchError(error));
  }
}
