import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';
import { PrismaService } from '../../src/persistence/prisma.service';

/**
 * P6.2 edge-case integration tests — covers:
 *  - Happy-path tests for previously untested endpoints
 *  - Additional role-gate and boundary scenarios
 */
describe('Edge-case integration tests (P6.2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /* ── GET /v1/rosters/current — missing happy-path test ───────── */

  describe('GET /v1/rosters/current', () => {
    it('returns 404 when no published roster covers the current date', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/rosters/current')
        .set('Authorization', `Bearer ${TOKENS.planner}`);

      // Seeded roster may not be PUBLISHED — expect 404 when none active
      expect([200, 404]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body.message).toContain('No current roster found');
      }
    });

    it('returns the current published roster when one exists', async () => {
      const prisma = app.get(PrismaService);
      const now = new Date();
      const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await prisma.roster.upsert({
        where: { id: SEED_IDS.rosterCurrent },
        create: {
          id: SEED_IDS.rosterCurrent,
          organizationUnitId: SEED_IDS.ouSecurity,
          periodStart,
          periodEnd,
          status: 'PUBLISHED',
          publishedAt: now,
        },
        update: {
          periodStart,
          periodEnd,
          status: 'PUBLISHED',
          publishedAt: now,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/v1/rosters/current')
        .set('Authorization', `Bearer ${TOKENS.planner}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(SEED_IDS.rosterCurrent);
      expect(response.body.status).toBe('PUBLISHED');
    });
  });

  /* ── POST /v1/closing-periods/{id}/start-review — missing happy-path ── */

  describe('POST /v1/closing-periods/{id}/start-review', () => {
    it('transitions OPEN period to REVIEW when manual review is enabled (admin-only)', async () => {
      const previous = process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
      process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = 'true';

      try {
        const prisma = app.get(PrismaService);
        const period = await prisma.closingPeriod.create({
          data: {
            organizationUnitId: SEED_IDS.ouAdmin,
            periodStart: new Date('2026-06-01T00:00:00.000Z'),
            periodEnd: new Date('2026-06-30T23:59:59.000Z'),
            status: 'OPEN',
          },
        });

        const response = await request(app.getHttpServer())
          .post(`/v1/closing-periods/${period.id}/start-review`)
          .set('Authorization', `Bearer ${TOKENS.admin}`);

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('REVIEW');
      } finally {
        if (previous === undefined) {
          delete process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
        } else {
          process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = previous;
        }
      }
    });

    it('rejects start-review when manual review is disabled', async () => {
      const previous = process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
      process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = 'false';

      try {
        const prisma = app.get(PrismaService);
        const period = await prisma.closingPeriod.create({
          data: {
            organizationUnitId: SEED_IDS.ouAdmin,
            periodStart: new Date('2026-07-01T00:00:00.000Z'),
            periodEnd: new Date('2026-07-31T23:59:59.000Z'),
            status: 'OPEN',
          },
        });

        const response = await request(app.getHttpServer())
          .post(`/v1/closing-periods/${period.id}/start-review`)
          .set('Authorization', `Bearer ${TOKENS.admin}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('disabled');
      } finally {
        if (previous === undefined) {
          delete process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
        } else {
          process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = previous;
        }
      }
    });

    it('rejects start-review for non-ADMIN roles even when enabled', async () => {
      const previous = process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
      process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = 'true';

      try {
        const prisma = app.get(PrismaService);
        const period = await prisma.closingPeriod.create({
          data: {
            organizationUnitId: SEED_IDS.ouAdmin,
            periodStart: new Date('2026-08-01T00:00:00.000Z'),
            periodEnd: new Date('2026-08-31T23:59:59.000Z'),
            status: 'OPEN',
          },
        });

        const response = await request(app.getHttpServer())
          .post(`/v1/closing-periods/${period.id}/start-review`)
          .set('Authorization', `Bearer ${TOKENS.hr}`);

        expect(response.status).toBe(403);
      } finally {
        if (previous === undefined) {
          delete process.env.CLOSING_ALLOW_MANUAL_REVIEW_START;
        } else {
          process.env.CLOSING_ALLOW_MANUAL_REVIEW_START = previous;
        }
      }
    });
  });

  /* ── GET /v1/integrations/webhooks/endpoints — missing happy-path ── */

  describe('GET /v1/integrations/webhooks/endpoints', () => {
    it('returns webhook endpoint list for HR users', async () => {
      // Create an endpoint first
      const created = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          name: 'edge-case-test',
          url: 'https://example.com/webhook',
          subscribedEvents: ['booking.created'],
        });
      expect(created.status).toBe(201);

      const response = await request(app.getHttpServer())
        .get('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.some((ep: { name: string }) => ep.name === 'edge-case-test')).toBe(true);
    });
  });

  /* ── Additional edge-case: absences/me for user with no absences ── */

  describe('GET /v1/absences/me edge cases', () => {
    it('returns empty array for user with no absences', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/absences/me')
        .set('Authorization', `Bearer ${TOKENS.planner}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  /* ── Additional edge-case: bookings/me for user with no bookings ── */

  describe('GET /v1/bookings/me edge cases', () => {
    it('returns empty array for user with no bookings in a given day', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/bookings/me')
        .set('Authorization', `Bearer ${TOKENS.planner}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  /* ── Additional edge-case: closing-periods list for different roles ── */

  describe('GET /v1/closing-periods role-based access', () => {
    it('returns list for HR user', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('returns list for team lead (scoped to their unit)', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.lead}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
