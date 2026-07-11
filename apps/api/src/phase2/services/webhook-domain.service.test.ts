import { createHash, createHmac } from 'node:crypto';
import { OutboxStatus } from '@cueq/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postWebhook } from '../../common/http/webhook-http-client';
import { WebhookDomainService } from './webhook-domain.service';

vi.mock('../../common/http/webhook-http-client', () => ({ postWebhook: vi.fn() }));

const postWebhookMock = vi.mocked(postWebhook);
const SIGNING_SECRET = createHash('sha256').update('webhook test fixture').digest('hex');

function fixture() {
  const event = {
    id: 'event-1',
    eventType: 'BOOKING_CREATED',
    aggregateType: 'Booking',
    aggregateId: 'booking-1',
    payload: { personId: 'person-1' },
    status: OutboxStatus.PENDING,
    attempts: 0,
    nextAttemptAt: null,
    createdAt: new Date('2026-07-11T05:00:00.000Z'),
  };
  const endpoint = {
    id: 'endpoint-1',
    url: 'https://receiver.example/hook',
    secretRef: SIGNING_SECRET,
    eventType: event.eventType,
    createdAt: new Date('2026-07-10T05:00:00.000Z'),
  };
  const prisma = {
    domainEventOutbox: {
      findMany: vi.fn().mockResolvedValue([event]),
      update: vi.fn().mockResolvedValue(undefined),
    },
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue([endpoint]),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  const personHelper = {
    personForUser: vi.fn().mockResolvedValue({ id: 'actor-1' }),
  };
  const auditHelper = {
    appendAudit: vi.fn().mockResolvedValue(undefined),
  };
  const service = new WebhookDomainService(
    prisma as never,
    personHelper as never,
    auditHelper as never,
  );

  return { service, prisma, auditHelper, event, endpoint };
}

const admin = {
  subject: 'admin-subject',
  email: 'admin@cueq.local',
  role: 'ADMIN',
  claims: {},
} as const;

beforeEach(() => {
  postWebhookMock.mockReset();
});

describe('WebhookDomainService dispatch transport', () => {
  it('preserves HMAC headers and marks a successful pinned delivery', async () => {
    const { service, prisma, auditHelper, event } = fixture();
    postWebhookMock.mockResolvedValue({ status: 204, body: '' });

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      failed: 0,
    });

    const request = postWebhookMock.mock.calls[0]?.[0];
    const expectedBody = JSON.stringify({
      eventId: event.id,
      eventType: event.eventType,
      timestamp: event.createdAt.toISOString(),
      version: 1,
      source: 'cueq-api',
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
    });
    expect(request).toMatchObject({
      url: 'https://receiver.example/hook',
      body: expectedBody,
      headers: {
        'Content-Type': 'application/json',
        'X-Cueq-Event-Type': 'BOOKING_CREATED',
        'X-Cueq-Signature': `sha256=${createHmac('sha256', SIGNING_SECRET)
          .update(expectedBody)
          .digest('hex')}`,
      },
    });
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SUCCESS', httpStatus: 204 }),
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: 'WEBHOOK_DISPATCH_RUN',
      entityType: 'DomainEventOutbox',
      entityId: expect.stringMatching(/^dispatch-/u),
      after: { processed: 1, delivered: 1, failed: 0, skipped: 0 },
    });
  });

  it('records DNS/transport failures and preserves retry plus audit bookkeeping', async () => {
    const { service, prisma, auditHelper } = fixture();
    postWebhookMock.mockRejectedValue(new Error('Webhook target DNS lookup failed.'));

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 1,
    });

    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        error: 'Webhook target DNS lookup failed.',
        httpStatus: null,
        deliveredAt: null,
      }),
    });
    expect(prisma.domainEventOutbox.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        status: OutboxStatus.FAILED,
        attempts: 1,
        processedAt: null,
        lastError: 'Webhook target DNS lookup failed.',
        nextAttemptAt: expect.any(Date),
      }),
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WEBHOOK_DISPATCH_RUN',
        after: { processed: 1, delivered: 0, failed: 1, skipped: 0 },
      }),
    );
  });
});
