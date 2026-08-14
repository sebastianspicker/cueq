import { createHash } from 'node:crypto';
import { OutboxStatus } from '@cueq/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
