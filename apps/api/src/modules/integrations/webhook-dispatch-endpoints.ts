import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import { encryptWebhookSigningSecret } from './webhooks/webhook-secret-envelope.js';

type CreateWebhookEndpointInput = {
  name: string;
  url: string;
  subscribedEvents: string[];
};

type CreateWebhookEndpointDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
};

/** Persists the endpoint, its encrypted secret reference, and its audit entry in one transaction. */
export async function createPersistedWebhookEndpoint(
  dependencies: CreateWebhookEndpointDependencies,
  input: CreateWebhookEndpointInput,
  actorId: string,
  secret: string,
) {
  const { prisma, auditHelper } = dependencies;
  return prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        name: input.name,
        url: input.url,
        subscribedEvents: input.subscribedEvents,
        secretRef: null,
        createdById: actorId,
        isActive: true,
      },
    });
    await tx.webhookEndpoint.update({
      where: { id: created.id },
      data: { secretRef: encryptWebhookSigningSecret(secret, created.id) },
    });
    await auditHelper.appendAudit(
      {
        actorId,
        action: 'WEBHOOK_ENDPOINT_CREATED',
        entityType: 'WebhookEndpoint',
        entityId: created.id,
        after: {
          url: created.url,
          subscribedEvents: created.subscribedEvents,
          isActive: created.isActive,
        },
      },
      tx,
    );
    return created;
  });
}
