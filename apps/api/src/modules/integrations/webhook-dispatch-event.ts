import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { decryptWebhookSigningSecret } from './webhooks/webhook-secret-envelope.js';
import type { postWebhook } from './webhooks/webhook-http-client.js';
import type { WebhookDispatchSettings } from './webhook-dispatch-settings.js';
import {
  claimWebhookEvent,
  finalizeSkippedWebhookEvent,
  finalizeWebhookDeliveries,
  releaseWebhookClaimForConfigurationFault,
  renewWebhookClaim,
  type DispatchableOutboxEvent,
} from './webhook-dispatch-claim.js';
import {
  activeEndpointsForEvent,
  deliverWebhookTargets,
  deliveryTargets,
  signingSecretsForTargets,
} from './webhook-delivery-dispatch.js';
import type { WebhookDispatchOutcome } from './webhook-dispatch-output.js';

const WEBHOOK_CONFIGURATION_ERROR = 'Webhook signing configuration unavailable.';

type WebhookDispatchEventInput = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  event: DispatchableOutboxEvent;
  now: Date;
  settings: WebhookDispatchSettings;
  actorId: string;
  decrypt: typeof decryptWebhookSigningSecret;
  post: typeof postWebhook;
};

/** Performs one serial, leased outbox dispatch without owning authorization or run-level accounting. */
export async function dispatchWebhookEvent(
  input: WebhookDispatchEventInput,
): Promise<WebhookDispatchOutcome> {
  const { prisma, auditHelper, event, now, settings, actorId, decrypt, post } = input;
  let claimUntil = await claimWebhookEvent(prisma, event, now, settings.claimLeaseMs);
  if (!claimUntil) return 'UNCLAIMED';

  const endpoints = await activeEndpointsForEvent(prisma.webhookEndpoint, event.eventType);
  if (endpoints.length === 0) {
    await finalizeSkippedWebhookEvent(prisma, event, claimUntil, now);
    return 'SKIPPED';
  }

  const targets = await deliveryTargets(prisma.webhookDelivery, event.id, endpoints);
  const signingSecrets = signingSecretsForTargets(targets, decrypt, WEBHOOK_CONFIGURATION_ERROR);
  if (!signingSecrets) {
    await releaseWebhookClaimForConfigurationFault(
      prisma,
      event,
      claimUntil,
      WEBHOOK_CONFIGURATION_ERROR,
    );
    await auditHelper.appendAudit({
      actorId,
      action: 'WEBHOOK_DISPATCH_CONFIGURATION_FAULT',
      entityType: 'DomainEventOutbox',
      entityId: event.id,
      after: { error: WEBHOOK_CONFIGURATION_ERROR, rescheduled: true },
    });
    return 'CONFIGURATION_FAULT';
  }

  const delivery = await deliverWebhookTargets({
    event,
    endpoints: targets,
    signingSecrets,
    initialClaimUntil: claimUntil,
    timeoutMs: settings.timeoutMs,
    configurationError: WEBHOOK_CONFIGURATION_ERROR,
    renewClaim: (currentLease) =>
      renewWebhookClaim(prisma, event, currentLease, settings.claimLeaseMs),
    post,
  });
  claimUntil = delivery.claimUntil;
  await finalizeWebhookDeliveries(prisma, event, claimUntil, delivery, settings.maxAttempts);
  return delivery.eventFailed ? 'FAILED' : 'DELIVERED';
}
