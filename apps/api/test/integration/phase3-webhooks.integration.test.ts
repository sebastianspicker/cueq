import { OutboxStatus } from '@cueq/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('Phase 3 integration: webhooks', () => {
  let app: INestApplication;

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers webhook endpoints and exposes outbox + delivery states', async () => {
    const createEndpoint = await request(app.getHttpServer())
      .post('/v1/integrations/webhooks/endpoints')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        name: 'integration-test',
        url: 'http://127.0.0.1:9/cueq-webhook',
        subscribedEvents: ['booking.created'],
      });
    expect(createEndpoint.status).toBe(201);

    const createBooking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personEmployee,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-03-04T08:00:00.000Z',
        endTime: '2026-03-04T16:00:00.000Z',
        source: 'WEB',
      });
    expect(createBooking.status).toBe(201);

    const outboxBefore = await request(app.getHttpServer())
      .get('/v1/integrations/events/outbox')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ status: 'PENDING' });
    expect(outboxBefore.status).toBe(200);
    expect(
      outboxBefore.body.some(
        (event: { eventType: string }) => event.eventType === 'booking.created',
      ),
    ).toBe(true);

    const dispatch = await request(app.getHttpServer())
      .post('/v1/integrations/webhooks/dispatch')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();
    expect(dispatch.status).toBe(201);

    const deliveries = await request(app.getHttpServer())
      .get('/v1/integrations/webhooks/deliveries')
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.length).toBeGreaterThan(0);
  });

  it('marks outbox events with no subscribed endpoint as skipped, not delivered', async () => {
    const prisma = app.get(PrismaService);
    const event = await prisma.domainEventOutbox.create({
      data: {
        eventType: 'violation.detected',
        aggregateType: 'Person',
        aggregateId: SEED_IDS.personEmployee,
        payload: { reason: 'integration-test' },
      },
    });

    const dispatch = await request(app.getHttpServer())
      .post('/v1/integrations/webhooks/dispatch')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();
    expect(dispatch.status).toBe(201);
    expect(dispatch.body.skipped).toBeGreaterThanOrEqual(1);

    const skipped = await request(app.getHttpServer())
      .get('/v1/integrations/events/outbox')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ status: OutboxStatus.SKIPPED });
    expect(skipped.status).toBe(200);
    expect(
      skipped.body.some(
        (outboxEvent: { id: string; status: string }) =>
          outboxEvent.id === event.id && outboxEvent.status === OutboxStatus.SKIPPED,
      ),
    ).toBe(true);

    const deliveries = await request(app.getHttpServer())
      .get('/v1/integrations/webhooks/deliveries')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ eventId: event.id });
    expect(deliveries.status).toBe(200);
    expect(deliveries.body).toEqual([]);
  });

  it('rejects webhook endpoints targeting private addresses when explicitly disabled', async () => {
    const previous = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'false';

    try {
      const createEndpoint = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          name: 'integration-test-private-block',
          url: 'http://127.0.0.1:9/cueq-webhook',
          subscribedEvents: ['booking.created'],
        });

      expect(createEndpoint.status).toBe(400);
      expect(createEndpoint.body.message).toContain(
        'Webhook url must not target localhost or private network addresses.',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
      } else {
        process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = previous;
      }
    }
  });

  it('rejects dispatch to existing private endpoint when private targets are disabled', async () => {
    const previous = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;

    try {
      process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
      const createEndpoint = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          name: 'integration-test-private-existing',
          url: 'http://127.0.0.1:9/cueq-webhook',
          subscribedEvents: ['booking.created'],
        });
      expect(createEndpoint.status).toBe(201);

      const createBooking = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: SEED_IDS.personEmployee,
          timeTypeId: SEED_IDS.timeTypeWork,
          startTime: '2026-03-05T08:00:00.000Z',
          endTime: '2026-03-05T16:00:00.000Z',
          source: 'WEB',
        });
      expect(createBooking.status).toBe(201);

      process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'false';

      const dispatch = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/dispatch')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send();
      expect(dispatch.status).toBe(201);
      expect(dispatch.body.failed).toBeGreaterThan(0);

      const deliveries = await request(app.getHttpServer())
        .get('/v1/integrations/webhooks/deliveries')
        .set('Authorization', `Bearer ${TOKENS.hr}`);
      expect(deliveries.status).toBe(200);
      expect(
        deliveries.body.some((entry: { error?: string }) =>
          String(entry.error ?? '').includes('Webhook url must not target localhost'),
        ),
      ).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
      } else {
        process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = previous;
      }
    }
  });
});
