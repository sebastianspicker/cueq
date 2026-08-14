import { createHash, createHmac } from 'node:crypto';
import { OutboxStatus } from '@cueq/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postWebhook } from '../../common/http/webhook-http-client.js';
import { encryptWebhookSigningSecret } from '../../common/integrations/webhook-secret-envelope.js';
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
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
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

  return { service, prisma, personHelper, auditHelper, event, endpoint };
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WebhookDomainService dispatch transport', () => {
  it('authorizes dispatch before resolving the acting identity', async () => {
    const { service, prisma, personHelper } = fixture();

    await expect(service.dispatchWebhooks({ ...admin, role: 'EMPLOYEE' } as never)).rejects.toThrow(
      'Only HR/Admin can dispatch webhooks.',
    );

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(prisma.domainEventOutbox.findMany).not.toHaveBeenCalled();
  });

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
    expect(prisma.webhookDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: 'SUCCESS', httpStatus: 204 })],
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

    expect(prisma.webhookDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          status: 'FAILED',
          error: 'Webhook target DNS lookup failed.',
          httpStatus: null,
          deliveredAt: null,
        }),
      ],
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

  it('skips an event with no active endpoint and finalizes its claim', async () => {
    const { service, prisma } = fixture();
    prisma.webhookEndpoint.findMany.mockResolvedValueOnce([]);

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 0,
      skipped: 1,
    });

    expect(prisma.webhookDelivery.findMany).not.toHaveBeenCalled();
    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'event-1', attempts: 0 }),
      data: expect.objectContaining({
        status: OutboxStatus.SKIPPED,
        attempts: 1,
        nextAttemptAt: null,
      }),
    });
  });

  it('stops before network delivery when lease renewal loses its CAS token', async () => {
    const { service, prisma } = fixture();
    prisma.domainEventOutbox.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(service.dispatchWebhooks(admin as never)).rejects.toThrow(
      'Webhook dispatch claim expired before it was renewed.',
    );

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it('does not persist delivery records when finalization loses its CAS token', async () => {
    const { service, prisma } = fixture();
    postWebhookMock.mockResolvedValueOnce({ status: 204, body: '' });
    prisma.domainEventOutbox.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(service.dispatchWebhooks(admin as never)).rejects.toThrow(
      'Webhook dispatch claim expired before it was finalized.',
    );

    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it('does not report success when bulk delivery persistence fails in the transaction', async () => {
    const { service, prisma, auditHelper } = fixture();
    postWebhookMock.mockResolvedValueOnce({ status: 204, body: '' });
    prisma.webhookDelivery.createMany.mockRejectedValueOnce(new Error('delivery write failed'));

    await expect(service.dispatchWebhooks(admin as never)).rejects.toThrow('delivery write failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.webhookDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ endpointId: 'endpoint-1', status: 'SUCCESS' })],
    });
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('delivers remaining mixed targets in endpoint order and renews immediately before each', async () => {
    const { service, prisma, endpoint } = fixture();
    const endpoint2 = {
      ...endpoint,
      id: 'endpoint-2',
      secretRef: encryptWebhookSigningSecret(SIGNING_SECRET, 'endpoint-2', {
        WEBHOOK_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      }),
    };
    const endpoint3 = {
      ...endpoint,
      id: 'endpoint-3',
      secretRef: encryptWebhookSigningSecret(SIGNING_SECRET, 'endpoint-3', {
        WEBHOOK_SECRET_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      }),
    };
    prisma.webhookEndpoint.findMany.mockResolvedValueOnce([endpoint, endpoint2, endpoint3]);
    prisma.webhookDelivery.findMany.mockResolvedValueOnce([{ endpointId: endpoint2.id }]);
    postWebhookMock
      .mockResolvedValueOnce({ status: 204, body: '' })
      .mockResolvedValueOnce({ status: 500, body: 'receiver error' });

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 1,
    });

    expect(postWebhookMock.mock.calls.map(([request]) => request.url)).toEqual([
      endpoint.url,
      endpoint3.url,
    ]);
    expect(prisma.webhookDelivery.createMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.webhookDelivery.createMany.mock.calls[0]?.[0].data.map(
        (record: { endpointId: string }) => record.endpointId,
      ),
    ).toEqual([endpoint.id, endpoint3.id]);
    const renewalCalls = prisma.domainEventOutbox.updateMany.mock.calls.slice(1, 3);
    expect(renewalCalls).toHaveLength(2);
    expect(renewalCalls.every(([call]) => call.data.nextAttemptAt instanceof Date)).toBe(true);
    expect(postWebhookMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.domainEventOutbox.updateMany.mock.invocationCallOrder[1] ?? 0,
    );
    expect(postWebhookMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      prisma.domainEventOutbox.updateMany.mock.invocationCallOrder[2] ?? 0,
    );
  });

  it('uses bounded defaults for invalid dispatch settings and truncates valid integer values', async () => {
    const { service, prisma } = fixture();
    prisma.domainEventOutbox.findMany.mockResolvedValue([]);
    vi.stubEnv('WEBHOOK_DISPATCH_BATCH_SIZE', '3.8');
    vi.stubEnv('WEBHOOK_MAX_ATTEMPTS', '-1');
    vi.stubEnv('WEBHOOK_REQUEST_TIMEOUT_MS', '0');
    vi.stubEnv('WEBHOOK_CLAIM_LEASE_MS', '1');

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      batchSize: 3,
      maxAttempts: 5,
      timeoutMs: 5000,
      claimLeaseMs: 15 * 60_000,
    });
  });

  it('keeps an error at the storage boundary and marks only the first excess character truncated', async () => {
    const { service, prisma } = fixture();
    const atBoundary = `Webhook ${'a'.repeat(992)}`;
    const overBoundary = `Webhook ${'a'.repeat(993)}`;

    postWebhookMock.mockRejectedValueOnce(new Error(atBoundary));
    await service.dispatchWebhooks(admin as never);
    expect(prisma.webhookDelivery.createMany.mock.calls[0]?.[0].data[0]?.error).toBe(atBoundary);

    postWebhookMock.mockRejectedValueOnce(new Error(overBoundary));
    await service.dispatchWebhooks(admin as never);
    expect(prisma.webhookDelivery.createMany.mock.calls[1]?.[0].data[0]?.error).toBe(
      `${overBoundary.slice(0, 1000)}...[truncated]`,
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
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
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
    const { service, prisma, endpoint, auditHelper } = fixture();
    endpoint.secretRef = secretRef;

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 0,
      failed: 0,
      configurationFaults: 1,
    });

    expect(postWebhookMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.domainEventOutbox.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: 'event-1', attempts: 0 }),
      data: {
        lastError: 'Webhook signing configuration unavailable.',
        nextAttemptAt: expect.any(Date),
      },
    });
    const configurationAuditIndex = auditHelper.appendAudit.mock.calls.findIndex(
      ([entry]) => entry.action === 'WEBHOOK_DISPATCH_CONFIGURATION_FAULT',
    );
    expect(configurationAuditIndex).toBeGreaterThanOrEqual(0);
    expect(
      auditHelper.appendAudit.mock.invocationCallOrder[configurationAuditIndex] ?? 0,
    ).toBeGreaterThan(prisma.domainEventOutbox.updateMany.mock.invocationCallOrder.at(-1) ?? 0);
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
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();

    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    postWebhookMock.mockResolvedValueOnce({ status: 204, body: '' });

    await expect(service.dispatchWebhooks(admin as never)).resolves.toMatchObject({
      processed: 1,
      delivered: 1,
      failed: 0,
      configurationFaults: 0,
    });

    expect(postWebhookMock).toHaveBeenCalledTimes(1);
    expect(prisma.webhookDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: 'SUCCESS', attempt: 1 })],
    });
  });
});

describe('WebhookDomainService listing contracts', () => {
  it('applies parsed outbox and delivery queries and returns ISO-safe public records', async () => {
    const { service, prisma, event } = fixture();
    const queriedEventId = 'clm123456789012345678901234';
    const listEvent = {
      ...event,
      nextAttemptAt: new Date('2026-07-11T06:00:00.000Z'),
      lastError: 'Webhook target DNS lookup failed.',
      processedAt: null,
    };
    prisma.domainEventOutbox.findMany.mockResolvedValueOnce([listEvent]);
    prisma.webhookDelivery.findMany.mockResolvedValueOnce([
      {
        id: 'delivery-1',
        outboxEventId: queriedEventId,
        endpointId: 'endpoint-1',
        attempt: 1,
        status: 'FAILED',
        httpStatus: null,
        responseBody: null,
        error: listEvent.lastError,
        deliveredAt: null,
        createdAt: new Date('2026-07-11T06:01:00.000Z'),
      },
    ]);

    await expect(
      service.listOutboxEvents(admin as never, { status: OutboxStatus.PENDING }),
    ).resolves.toEqual([
      {
        id: listEvent.id,
        eventType: listEvent.eventType,
        aggregateType: listEvent.aggregateType,
        aggregateId: listEvent.aggregateId,
        payload: listEvent.payload,
        status: listEvent.status,
        attempts: listEvent.attempts,
        nextAttemptAt: '2026-07-11T06:00:00.000Z',
        lastError: listEvent.lastError,
        processedAt: null,
        createdAt: '2026-07-11T05:00:00.000Z',
      },
    ]);
    expect(prisma.domainEventOutbox.findMany).toHaveBeenCalledWith({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    await expect(
      service.listWebhookDeliveries(admin as never, { eventId: queriedEventId }),
    ).resolves.toEqual([
      {
        id: 'delivery-1',
        outboxEventId: queriedEventId,
        endpointId: 'endpoint-1',
        attempt: 1,
        status: 'FAILED',
        httpStatus: null,
        responseBody: null,
        error: listEvent.lastError,
        deliveredAt: null,
        createdAt: '2026-07-11T06:01:00.000Z',
      },
    ]);
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith({
      where: { outboxEventId: queriedEventId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  });
});
