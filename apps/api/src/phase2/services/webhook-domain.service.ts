import { createHmac, randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import { CreateWebhookEndpointSchema, OutboxQuerySchema, DeliveryQuerySchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { assertWebhookTargetUrl } from '../../common/http/webhook-url';
import { postWebhook } from '../../common/http/webhook-http-client';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { HR_LIKE_ROLES } from '../helpers/role-constants';

const WEBHOOK_RESPONSE_BODY_MAX_BYTES = 8_000;
const WEBHOOK_ERROR_MAX_CHARS = 1_000;
const DEFAULT_WEBHOOK_CLAIM_LEASE_MS = 15 * 60_000;

function truncateForStorage(value: string | null, maxChars: number): string | null {
  if (value === null) {
    return null;
  }
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...[truncated]`;
}

function webhookDispatchError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Webhook ')) {
    return error.message;
  }

  return 'Webhook delivery request failed.';
}

@Injectable()
export class WebhookDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  private webhookBatchSize(): number {
    const parsed = Number(process.env.WEBHOOK_DISPATCH_BATCH_SIZE ?? '50');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 50;
  }

  private webhookMaxAttempts(): number {
    const parsed = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? '5');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5;
  }

  private webhookTimeoutMs(): number {
    const parsed = Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS ?? '5000');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5000;
  }

  private webhookClaimLeaseMs(timeoutMs: number): number {
    const parsed = Number(process.env.WEBHOOK_CLAIM_LEASE_MS ?? DEFAULT_WEBHOOK_CLAIM_LEASE_MS);
    const configured = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
    return Math.max(configured, DEFAULT_WEBHOOK_CLAIM_LEASE_MS, timeoutMs * 2);
  }

  private async renewWebhookClaim(
    event: { id: string; status: OutboxStatus; attempts: number },
    currentLease: Date,
    claimLeaseMs: number,
  ): Promise<Date> {
    const nextLease = new Date(Date.now() + claimLeaseMs);
    const renewed = await this.prisma.domainEventOutbox.updateMany({
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

  async createWebhookEndpoint(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can configure webhooks.');
    }

    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateWebhookEndpointSchema.parse(payload);
    const validatedUrl = assertWebhookTargetUrl(parsed.url).toString();
    const secret = randomBytes(32).toString('hex');
    const endpoint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.webhookEndpoint.create({
        data: {
          name: parsed.name,
          url: validatedUrl,
          subscribedEvents: parsed.subscribedEvents,
          secretRef: secret,
          createdById: actor.id,
          isActive: true,
        },
      });

      await this.auditHelper.appendAudit(
        {
          actorId: actor.id,
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

    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      subscribedEvents: endpoint.subscribedEvents,
      isActive: endpoint.isActive,
      createdById: endpoint.createdById,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      // Returned once on creation only — receivers must store this secret.
      signingSecret: secret,
    };
  }

  async listWebhookEndpoints(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read webhook endpoints.');
    }

    return this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        subscribedEvents: true,
        isActive: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listOutboxEvents(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read outbox events.');
    }

    const parsed = OutboxQuerySchema.parse(query ?? {});
    const events = await this.prisma.domainEventOutbox.findMany({
      where: parsed.status ? { status: parsed.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

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

  async listWebhookDeliveries(user: AuthenticatedIdentity, query: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read webhook deliveries.');
    }

    const parsed = DeliveryQuerySchema.parse(query ?? {});
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: parsed.eventId ? { outboxEventId: parsed.eventId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

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

  async dispatchWebhooks(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can dispatch webhooks.');
    }

    const actor = await this.personHelper.personForUser(user);
    const now = new Date();
    const batchSize = this.webhookBatchSize();
    const maxAttempts = this.webhookMaxAttempts();
    const timeoutMs = this.webhookTimeoutMs();
    const claimLeaseMs = this.webhookClaimLeaseMs(timeoutMs);

    const pendingEvents = await this.prisma.domainEventOutbox.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        attempts: { lt: maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    let processed = 0;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pendingEvents) {
      let claimUntil = new Date(Date.now() + claimLeaseMs);
      const claim = await this.prisma.domainEventOutbox.updateMany({
        where: {
          id: event.id,
          status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
          attempts: event.attempts,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: {
          nextAttemptAt: claimUntil,
        },
      });
      if (claim.count !== 1) {
        continue;
      }

      processed += 1;
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { isActive: true, subscribedEvents: { has: event.eventType } },
        orderBy: { createdAt: 'asc' },
      });

      const attempt = event.attempts + 1;
      const payloadObject =
        typeof event.payload === 'object' && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : { payload: event.payload };

      if (endpoints.length === 0) {
        skipped += 1;
        const finalized = await this.prisma.domainEventOutbox.updateMany({
          where: {
            id: event.id,
            status: event.status,
            attempts: event.attempts,
            nextAttemptAt: claimUntil,
          },
          data: {
            status: OutboxStatus.SKIPPED,
            attempts: attempt,
            processedAt: now,
            lastError: null,
            nextAttemptAt: null,
          },
        });
        if (finalized.count !== 1) {
          throw new ConflictException('Webhook dispatch claim expired before it was finalized.');
        }
        continue;
      }

      const successfulDeliveries = await this.prisma.webhookDelivery.findMany({
        where: {
          outboxEventId: event.id,
          status: 'SUCCESS',
          endpointId: { in: endpoints.map((endpoint) => endpoint.id) },
        },
        select: { endpointId: true },
      });
      const successfulEndpointIds = new Set(
        successfulDeliveries.map((delivery) => delivery.endpointId),
      );
      const endpointsToDeliver = endpoints.filter(
        (endpoint) => !successfulEndpointIds.has(endpoint.id),
      );

      const envelope = {
        eventId: event.id,
        eventType: event.eventType,
        timestamp: event.createdAt.toISOString(),
        version: 1,
        source: 'cueq-api',
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: payloadObject,
      };

      let eventFailed = false;
      let lastError: string | null = null;
      const deliveryResults: Array<{
        outboxEventId: string;
        endpointId: string;
        attempt: number;
        status: 'SUCCESS' | 'FAILED';
        httpStatus: number | null;
        responseBody: string | null;
        error: string | null;
        deliveredAt: Date | null;
      }> = [];

      for (const endpoint of endpointsToDeliver) {
        claimUntil = await this.renewWebhookClaim(event, claimUntil, claimLeaseMs);
        let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let httpStatus: number | null = null;
        let responseBody: string | null = null;
        let error: string | null = null;
        let deliveredAt: Date | null = null;
        const body = JSON.stringify(envelope);
        const signatureHeader: Record<string, string> = {};
        if (endpoint.secretRef) {
          const sig = createHmac('sha256', endpoint.secretRef).update(body).digest('hex');
          signatureHeader['X-Cueq-Signature'] = `sha256=${sig}`;
        }

        try {
          const response = await postWebhook({
            url: endpoint.url,
            headers: {
              'Content-Type': 'application/json',
              'X-Cueq-Event-Type': event.eventType,
              ...signatureHeader,
            },
            body,
            timeoutMs,
            maxResponseBytes: WEBHOOK_RESPONSE_BODY_MAX_BYTES,
          });

          httpStatus = response.status;
          responseBody = response.body;
          if (response.status >= 200 && response.status < 300) {
            deliveredAt = new Date();
          } else {
            status = 'FAILED';
            error = `HTTP ${response.status}`;
          }
        } catch (dispatchError) {
          status = 'FAILED';
          error = webhookDispatchError(dispatchError);
        }
        error = truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS);

        if (status === 'FAILED') {
          eventFailed = true;
          lastError = error ?? 'Webhook delivery failed';
        }

        deliveryResults.push({
          outboxEventId: event.id,
          endpointId: endpoint.id,
          attempt,
          status,
          httpStatus,
          responseBody,
          error,
          deliveredAt,
        });
      }

      const retryDelayMinutes = 2 ** Math.min(attempt, 6);
      await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.domainEventOutbox.updateMany({
          where: {
            id: event.id,
            status: event.status,
            attempts: event.attempts,
            nextAttemptAt: claimUntil,
          },
          data: eventFailed
            ? {
                status: OutboxStatus.FAILED,
                attempts: attempt,
                processedAt: null,
                lastError,
                nextAttemptAt:
                  attempt >= maxAttempts ? null : new Date(Date.now() + retryDelayMinutes * 60_000),
              }
            : {
                status: OutboxStatus.DELIVERED,
                attempts: attempt,
                processedAt: new Date(),
                lastError: null,
                nextAttemptAt: null,
              },
        });
        if (finalized.count !== 1) {
          throw new ConflictException('Webhook dispatch claim expired before it was finalized.');
        }
        for (const delivery of deliveryResults) {
          await tx.webhookDelivery.create({ data: delivery });
        }
      });

      if (eventFailed) {
        failed += 1;
      } else {
        delivered += 1;
      }
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'WEBHOOK_DISPATCH_RUN',
      entityType: 'DomainEventOutbox',
      entityId: `dispatch-${now.toISOString()}`,
      after: { processed, delivered, failed, skipped },
    });

    return {
      processed,
      delivered,
      failed,
      skipped,
      batchSize,
      maxAttempts,
      timeoutMs,
    };
  }
}
