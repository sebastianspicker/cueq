import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OutboxStatus, Role } from '@cueq/database';
import {
  CreateWebhookEndpointSchema,
  OutboxQuerySchema,
  DeliveryQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { assertWebhookDispatchTargetUrl, assertWebhookTargetUrl } from '../../common/http/webhook-url';
import { readResponseBodyWithLimit } from '../../common/http/read-response-body';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { HR_LIKE_ROLES } from '../helpers/role-constants';

const WEBHOOK_RESPONSE_BODY_MAX_CHARS = 8_000;
const WEBHOOK_ERROR_MAX_CHARS = 1_000;

function truncateForStorage(value: string | null, maxChars: number): string | null {
  if (value === null) {
    return null;
  }
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...[truncated]`;
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

  async createWebhookEndpoint(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can configure webhooks.');
    }

    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateWebhookEndpointSchema.parse(payload);
    const validatedUrl = assertWebhookTargetUrl(parsed.url).toString();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        name: parsed.name,
        url: validatedUrl,
        subscribedEvents: parsed.subscribedEvents,
        secretRef: parsed.secretRef,
        createdById: actor.id,
        isActive: true,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'WEBHOOK_ENDPOINT_CREATED',
      entityType: 'WebhookEndpoint',
      entityId: endpoint.id,
      after: {
        url: endpoint.url,
        subscribedEvents: endpoint.subscribedEvents,
        isActive: endpoint.isActive,
      },
    });

    return endpoint;
  }

  async listWebhookEndpoints(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read webhook endpoints.');
    }

    return this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
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
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.DELIVERED,
            attempts: attempt,
            processedAt: now,
            lastError: null,
            nextAttemptAt: null,
          },
        });
        continue;
      }

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

      for (const endpoint of endpoints) {
        let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let httpStatus: number | null = null;
        let responseBody: string | null = null;
        let error: string | null = null;
        let deliveredAt: Date | null = null;
        let targetUrl: string;

        try {
          targetUrl = (await assertWebhookDispatchTargetUrl(endpoint.url)).toString();
        } catch (validationError) {
          status = 'FAILED';
          error =
            validationError instanceof BadRequestException
              ? String(validationError.message)
              : validationError instanceof Error
                ? validationError.message
                : 'Invalid webhook endpoint url';
          error = truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS);
          eventFailed = true;
          lastError = error;

          await this.prisma.webhookDelivery.create({
            data: {
              outboxEventId: event.id,
              endpointId: endpoint.id,
              attempt,
              status,
              httpStatus,
              responseBody,
              error,
              deliveredAt,
            },
          });
          continue;
        }

        try {
          const response = await fetch(targetUrl, {
            method: 'POST',
            redirect: 'manual',
            headers: {
              'Content-Type': 'application/json',
              'X-Cueq-Event-Type': event.eventType,
            },
            body: JSON.stringify(envelope),
            signal: AbortSignal.timeout(timeoutMs),
          });

          httpStatus = response.status;
          responseBody = await readResponseBodyWithLimit(response, WEBHOOK_RESPONSE_BODY_MAX_CHARS);
          if (response.ok) {
            deliveredAt = new Date();
          } else {
            status = 'FAILED';
            error = `HTTP ${response.status}`;
          }
        } catch (dispatchError) {
          status = 'FAILED';
          error = dispatchError instanceof Error ? dispatchError.message : 'Unknown dispatch error';
        }
        error = truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS);

        if (status === 'FAILED') {
          eventFailed = true;
          lastError = error ?? 'Webhook delivery failed';
        }

        await this.prisma.webhookDelivery.create({
          data: {
            outboxEventId: event.id,
            endpointId: endpoint.id,
            attempt,
            status,
            httpStatus,
            responseBody,
            error,
            deliveredAt,
          },
        });
      }

      if (!eventFailed) {
        delivered += 1;
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.DELIVERED,
            attempts: attempt,
            processedAt: new Date(),
            lastError: null,
            nextAttemptAt: null,
          },
        });
      } else {
        failed += 1;
        const retryDelayMinutes = 2 ** Math.min(attempt, 6);
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.FAILED,
            attempts: attempt,
            processedAt: null,
            lastError,
            nextAttemptAt:
              attempt >= maxAttempts ? null : new Date(now.getTime() + retryDelayMinutes * 60_000),
          },
        });
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
