/** Dispatches outbox events to webhooks with leases, bounded retries, and redacted diagnostics. */
import { createHmac, randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import { CreateWebhookEndpointSchema, OutboxQuerySchema, DeliveryQuerySchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { assertWebhookTargetUrl } from '../../common/http/webhook-url.js';
import { postWebhook } from '../../common/http/webhook-http-client.js';
import {
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from '../../common/integrations/webhook-secret-envelope.js';
import { PersonHelper } from '../helpers/person.helper.js';
import { AuditHelper } from '../helpers/audit.helper.js';
import { HR_LIKE_ROLES } from '../helpers/role-constants.js';

const WEBHOOK_RESPONSE_BODY_MAX_BYTES = 8_000;
const WEBHOOK_ERROR_MAX_CHARS = 1_000;
const DEFAULT_WEBHOOK_CLAIM_LEASE_MS = 15 * 60_000;
const WEBHOOK_CONFIGURATION_RETRY_DELAY_MS = 5 * 60_000;
const WEBHOOK_CONFIGURATION_ERROR = 'Webhook signing configuration unavailable.';

type WebhookDispatchSettings = {
  batchSize: number;
  maxAttempts: number;
  timeoutMs: number;
  claimLeaseMs: number;
};

type WebhookDispatchCounters = {
  processed: number;
  delivered: number;
  failed: number;
  skipped: number;
  configurationFaults: number;
};

type WebhookDispatchOutcome =
  | 'UNCLAIMED'
  | 'DELIVERED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CONFIGURATION_FAULT';

type DispatchableOutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  createdAt: Date;
};

type DeliveryEndpoint = { id: string; url: string; secretRef: string | null };

type DeliveryRecord = {
  outboxEventId: string;
  endpointId: string;
  attempt: number;
  status: 'SUCCESS' | 'FAILED';
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  deliveredAt: Date | null;
};

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

/**
 * Delivers outbox events to configured webhooks with leased claims, bounded retry state, and redacted diagnostics.
 * Delivery bookkeeping is designed to make concurrent dispatchers and replay attempts safe.
 */
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

  private async releaseWebhookClaimForConfigurationFault(
    event: { id: string; status: OutboxStatus; attempts: number },
    claimUntil: Date,
  ): Promise<void> {
    const released = await this.prisma.domainEventOutbox.updateMany({
      where: {
        id: event.id,
        status: event.status,
        attempts: event.attempts,
        nextAttemptAt: claimUntil,
      },
      data: {
        lastError: WEBHOOK_CONFIGURATION_ERROR,
        nextAttemptAt: new Date(Date.now() + WEBHOOK_CONFIGURATION_RETRY_DELAY_MS),
      },
    });
    if (released.count !== 1) {
      throw new ConflictException('Webhook dispatch claim expired before it was released.');
    }
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
          secretRef: null,
          createdById: actor.id,
          isActive: true,
        },
      });
      await tx.webhookEndpoint.update({
        where: { id: created.id },
        data: { secretRef: encryptWebhookSigningSecret(secret, created.id) },
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
      // Returned once on creation only: receivers must store this secret.
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
    const settings = this.webhookDispatchSettings();
    const pendingEvents = await this.pendingWebhookEvents(now, settings);
    const counters: WebhookDispatchCounters = {
      processed: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      configurationFaults: 0,
    };

    for (const event of pendingEvents) {
      const outcome = await this.dispatchWebhookEvent(event, now, settings, actor.id);
      this.recordDispatchOutcome(counters, outcome);
    }

    await this.auditWebhookDispatchRun(actor.id, now, counters);
    return { ...counters, ...settings };
  }

  private webhookDispatchSettings(): WebhookDispatchSettings {
    const timeoutMs = this.webhookTimeoutMs();
    return {
      batchSize: this.webhookBatchSize(),
      maxAttempts: this.webhookMaxAttempts(),
      timeoutMs,
      claimLeaseMs: this.webhookClaimLeaseMs(timeoutMs),
    };
  }

  private pendingWebhookEvents(now: Date, settings: WebhookDispatchSettings) {
    return this.prisma.domainEventOutbox.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        attempts: { lt: settings.maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: settings.batchSize,
    });
  }

  private async dispatchWebhookEvent(
    event: DispatchableOutboxEvent,
    now: Date,
    settings: WebhookDispatchSettings,
    actorId: string,
  ): Promise<WebhookDispatchOutcome> {
    let claimUntil = await this.claimWebhookEvent(event, now, settings.claimLeaseMs);
    if (!claimUntil) return 'UNCLAIMED';

    const endpoints = await this.activeEndpointsForEvent(event.eventType);
    if (endpoints.length === 0) {
      await this.finalizeSkippedWebhookEvent(event, claimUntil, now);
      return 'SKIPPED';
    }

    const targets = await this.deliveryTargets(event.id, endpoints);
    const signingSecrets = await this.signingSecretsForTargets(targets);
    if (!signingSecrets) {
      await this.recordWebhookConfigurationFault(event, claimUntil, actorId);
      return 'CONFIGURATION_FAULT';
    }

    const delivery = await this.deliverWebhookTargets(
      event,
      targets,
      signingSecrets,
      claimUntil,
      settings,
    );
    claimUntil = delivery.claimUntil;
    await this.finalizeWebhookDeliveries(event, claimUntil, delivery, settings.maxAttempts);
    return delivery.eventFailed ? 'FAILED' : 'DELIVERED';
  }

  private async claimWebhookEvent(
    event: DispatchableOutboxEvent,
    now: Date,
    claimLeaseMs: number,
  ): Promise<Date | null> {
    const claimUntil = new Date(Date.now() + claimLeaseMs);
    const claim = await this.prisma.domainEventOutbox.updateMany({
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

  private activeEndpointsForEvent(eventType: string): Promise<DeliveryEndpoint[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { isActive: true, subscribedEvents: { has: eventType } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async deliveryTargets(
    eventId: string,
    endpoints: DeliveryEndpoint[],
  ): Promise<DeliveryEndpoint[]> {
    const successfulDeliveries = await this.prisma.webhookDelivery.findMany({
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

  private async signingSecretsForTargets(
    endpoints: DeliveryEndpoint[],
  ): Promise<Map<string, string> | null> {
    const signingSecrets = new Map<string, string>();
    try {
      for (const endpoint of endpoints) {
        if (!endpoint.secretRef) throw new Error(WEBHOOK_CONFIGURATION_ERROR);
        signingSecrets.set(
          endpoint.id,
          decryptWebhookSigningSecret(endpoint.secretRef, endpoint.id),
        );
      }
      return signingSecrets;
    } catch {
      return null;
    }
  }

  private async recordWebhookConfigurationFault(
    event: DispatchableOutboxEvent,
    claimUntil: Date,
    actorId: string,
  ): Promise<void> {
    await this.releaseWebhookClaimForConfigurationFault(event, claimUntil);
    await this.auditHelper.appendAudit({
      actorId,
      action: 'WEBHOOK_DISPATCH_CONFIGURATION_FAULT',
      entityType: 'DomainEventOutbox',
      entityId: event.id,
      after: { error: WEBHOOK_CONFIGURATION_ERROR, rescheduled: true },
    });
  }

  private async deliverWebhookTargets(
    event: DispatchableOutboxEvent,
    endpoints: DeliveryEndpoint[],
    signingSecrets: Map<string, string>,
    initialClaimUntil: Date,
    settings: WebhookDispatchSettings,
  ): Promise<{
    claimUntil: Date;
    eventFailed: boolean;
    lastError: string | null;
    records: DeliveryRecord[];
  }> {
    const envelope = this.webhookEnvelope(event);
    const body = JSON.stringify(envelope);
    const attempt = event.attempts + 1;
    let claimUntil = initialClaimUntil;
    const records: DeliveryRecord[] = [];
    let lastError: string | null = null;

    for (const endpoint of endpoints) {
      claimUntil = await this.renewWebhookClaim(event, claimUntil, settings.claimLeaseMs);
      const record = await this.deliverWebhookTarget(
        event,
        endpoint,
        signingSecrets,
        body,
        attempt,
        settings.timeoutMs,
      );
      records.push(record);
      if (record.status === 'FAILED') lastError = record.error ?? 'Webhook delivery failed';
    }

    return { claimUntil, eventFailed: lastError !== null, lastError, records };
  }

  private webhookEnvelope(event: DispatchableOutboxEvent) {
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

  private async deliverWebhookTarget(
    event: DispatchableOutboxEvent,
    endpoint: DeliveryEndpoint,
    signingSecrets: Map<string, string>,
    body: string,
    attempt: number,
    timeoutMs: number,
  ): Promise<DeliveryRecord> {
    try {
      const signingSecret = signingSecrets.get(endpoint.id);
      if (!signingSecret) throw new Error(WEBHOOK_CONFIGURATION_ERROR);

      const response = await postWebhook({
        url: endpoint.url,
        headers: this.webhookHeaders(event.eventType, signingSecret, body),
        body,
        timeoutMs,
        maxResponseBytes: WEBHOOK_RESPONSE_BODY_MAX_BYTES,
      });
      return this.deliveryRecord(event.id, endpoint.id, attempt, response.status, response.body);
    } catch (error) {
      return this.failedDeliveryRecord(event.id, endpoint.id, attempt, webhookDispatchError(error));
    }
  }

  private webhookHeaders(eventType: string, secret: string, body: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Cueq-Event-Type': eventType,
      'X-Cueq-Signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    };
  }

  private deliveryRecord(
    eventId: string,
    endpointId: string,
    attempt: number,
    httpStatus: number,
    responseBody: string,
  ): DeliveryRecord {
    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        outboxEventId: eventId,
        endpointId,
        attempt,
        status: 'SUCCESS',
        httpStatus,
        responseBody,
        error: null,
        deliveredAt: new Date(),
      };
    }
    return this.failedDeliveryRecord(
      eventId,
      endpointId,
      attempt,
      `HTTP ${httpStatus}`,
      httpStatus,
      responseBody,
    );
  }

  private failedDeliveryRecord(
    eventId: string,
    endpointId: string,
    attempt: number,
    error: string,
    httpStatus: number | null = null,
    responseBody: string | null = null,
  ): DeliveryRecord {
    return {
      outboxEventId: eventId,
      endpointId,
      attempt,
      status: 'FAILED',
      httpStatus,
      responseBody,
      error: truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS),
      deliveredAt: null,
    };
  }

  private async finalizeSkippedWebhookEvent(
    event: DispatchableOutboxEvent,
    claimUntil: Date,
    now: Date,
  ): Promise<void> {
    await this.finalizeWebhookEvent(event, claimUntil, {
      status: OutboxStatus.SKIPPED,
      attempts: event.attempts + 1,
      processedAt: now,
      lastError: null,
      nextAttemptAt: null,
    });
  }

  private async finalizeWebhookDeliveries(
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
          nextAttemptAt: this.retryTime(attempt, maxAttempts),
        }
      : {
          status: OutboxStatus.DELIVERED,
          attempts: attempt,
          processedAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        };
    await this.prisma.$transaction(async (tx) => {
      await this.finalizeWebhookEvent(event, claimUntil, data, tx);
      for (const record of delivery.records) await tx.webhookDelivery.create({ data: record });
    });
  }

  private retryTime(attempt: number, maxAttempts: number): Date | null {
    if (attempt >= maxAttempts) return null;
    return new Date(Date.now() + 2 ** Math.min(attempt, 6) * 60_000);
  }

  private async finalizeWebhookEvent(
    event: DispatchableOutboxEvent,
    claimUntil: Date,
    data: Record<string, unknown>,
    db: Pick<PrismaService, 'domainEventOutbox'> = this.prisma,
  ): Promise<void> {
    const finalized = await db.domainEventOutbox.updateMany({
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

  private recordDispatchOutcome(
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

  private async auditWebhookDispatchRun(
    actorId: string,
    now: Date,
    counters: WebhookDispatchCounters,
  ): Promise<void> {
    await this.auditHelper.appendAudit({
      actorId,
      action: 'WEBHOOK_DISPATCH_RUN',
      entityType: 'DomainEventOutbox',
      entityId: `dispatch-${now.toISOString()}`,
      after: counters,
    });
  }
}
