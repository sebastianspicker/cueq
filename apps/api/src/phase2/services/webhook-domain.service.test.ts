import { createHash, createHmac } from 'node:crypto';
import { OutboxStatus } from '@cueq/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postWebhook } from '../../common/http/webhook-http-client.js';
import {
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from '../../common/integrations/webhook-secret-envelope.js';
import { WebhookDomainService } from './webhook-domain.service.js';

vi.mock('../../common/http/webhook-http-client.js', () => ({ postWebhook: vi.fn() }));

const postWebhookMock = vi.mocked(postWebhook);
const SIGNING_SECRET = createHash('sha256').update('webhook test fixture').digest('hex');
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString('base64');

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
  const endpoint: {
    id: string;
    url: string;
    secretRef: string | null;
    eventType: string;
    createdAt: Date;
  } = {
    id: 'endpoint-1',
    url: 'https://receiver.example/hook',
    secretRef: encryptWebhookSigningSecret(SIGNING_SECRET, 'endpoint-1', {
      WEBHOOK_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    }),
    eventType: event.eventType,
    createdAt: new Date('2026-07-10T05:00:00.000Z'),
  };
  const prisma = {
    domainEventOutbox: {
      findMany: vi.fn().mockResolvedValue([event]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue([endpoint]),
      create: vi.fn().mockResolvedValue({
        id: 'endpoint-new',
        name: 'Payroll receiver',
        url: 'https://receiver.example/hook',
        subscribedEvents: ['export.ready'],
        isActive: true,
        createdById: 'actor-1',
        createdAt: new Date('2026-07-14T12:00:00.000Z'),
        updatedAt: new Date('2026-07-14T12:00:00.000Z'),
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
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
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
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
      after: { processed: 1, delivered: 1, failed: 0, skipped: 0, configurationFaults: 0 },
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
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'event-1', attempts: 0 }),
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
        after: { processed: 1, delivered: 0, failed: 1, skipped: 0, configurationFaults: 0 },
      }),
    );
  });

  it('does not send when another dispatcher already claimed the event', async () => {
    const { service, prisma, auditHelper } = fixture();
    prisma.domainEventOutbox.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    });

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookEndpoint.findMany).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WEBHOOK_DISPATCH_RUN',
        after: { processed: 0, delivered: 0, failed: 0, skipped: 0, configurationFaults: 0 },
      }),
    );
  });

  it('does not consume the final attempt until dispatch is finalized', async () => {
    const { service, prisma, event } = fixture();
    event.attempts = 4;
    prisma.webhookEndpoint.findMany.mockRejectedValueOnce(new Error('simulated process stop'));

    await expect(service.dispatchWebhooks(admin as never)).rejects.toThrow(
      'simulated process stop',
    );

    expect(prisma.domainEventOutbox.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'event-1', attempts: 4 }),
      data: {
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it('does not redeliver an event to an endpoint that succeeded on an earlier attempt', async () => {
    const { service, prisma } = fixture();
    prisma.webhookDelivery.findMany.mockResolvedValueOnce([{ endpointId: 'endpoint-1' }]);

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      failed: 0,
    });

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.DELIVERED }),
      }),
    );
  });

  it('does not let a completed endpoint configuration fault block remaining event finalization', async () => {
    const { service, prisma, endpoint } = fixture();
    endpoint.secretRef = 'legacy-or-corrupt';
    prisma.webhookDelivery.findMany.mockResolvedValueOnce([{ endpointId: 'endpoint-1' }]);

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      failed: 0,
      configurationFaults: 0,
    });

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.DELIVERED }),
      }),
    );
  });

  it.each([
    ['null storage', null],
    ['legacy plaintext storage', SIGNING_SECRET],
    ['malformed storage', 'v1.not-base64.ciphertext.tag'],
  ])('releases the claim without consuming an attempt for %s', async (_label, secretRef) => {
    const { service, prisma, endpoint } = fixture();
    endpoint.secretRef = secretRef;

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 0,
      configurationFaults: 1,
    });

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'event-1', attempts: 0 }),
      data: {
        lastError: 'Webhook signing configuration unavailable.',
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it('does not consume an attempt for a wrong key and dispatches after the key is fixed', async () => {
    const { service, prisma, event } = fixture();
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 0,
      configurationFaults: 1,
    });

    expect(event.attempts).toBe(0);
    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();

    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    postWebhookMock.mockResolvedValueOnce({ status: 204, body: '' });

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      failed: 0,
      configurationFaults: 0,
    });

    expect(postWebhookMock).toHaveBeenCalledTimes(1);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SUCCESS', attempt: 1 }),
    });
  });
});

describe('WebhookDomainService endpoint atomicity', () => {
  it('creates the endpoint and its audit through the same transaction client', async () => {
    const { service, prisma, auditHelper } = fixture();

    const created = await service.createWebhookEndpoint(admin as never, {
      name: 'Payroll receiver',
      url: 'https://receiver.example/hook',
      subscribedEvents: ['export.ready'],
    });

    expect(created).toMatchObject({ id: 'endpoint-new', signingSecret: expect.any(String) });
    expect(prisma.webhookEndpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ secretRef: null }),
    });
    const encryptedSecret = prisma.webhookEndpoint.update.mock.calls[0]?.[0]?.data.secretRef;
    expect(encryptedSecret).toEqual(expect.any(String));
    expect(encryptedSecret).not.toContain(created.signingSecret);
    expect(
      decryptWebhookSigningSecret(encryptedSecret as string, 'endpoint-new', {
        WEBHOOK_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      }),
    ).toBe(created.signingSecret);
    expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: 'endpoint-new' },
      data: { secretRef: encryptedSecret },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), prisma);
  });

  it('does not report endpoint creation success when its audit participant fails', async () => {
    const { service, auditHelper } = fixture();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.createWebhookEndpoint(admin as never, {
        name: 'Payroll receiver',
        url: 'https://receiver.example/hook',
        subscribedEvents: ['export.ready'],
      }),
    ).rejects.toThrow('audit unavailable');
  });
});
