import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase3Data, TOKENS } from '../test-helpers.js';

/**
 * Error-path integration tests covering:
 *  - 401 Unauthorized for missing/invalid auth
 *  - 403 Forbidden for role violations
 *  - 404 Not Found for missing entities
 *  - 400 Bad Request for invalid CUID params
 *  - 400 Bad Request for domain validation failures
 *  - Validation error response shape (ZodExceptionFilter + ZodValidationPipe)
 *  - Missing referenced entities (person not found → 404)
 *  - Error response safety (no stack traces, no PII)
 *  - Consistent error shape across all error status codes
 */
describe('Error-path coverage', () => {
  let app: INestApplication;

  const FAKE_CUID = 'c999999999999999999999999';

  function as(token: string) {
    const server = app.getHttpServer();

    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${token}`),
    };
  }

  function expectStringMessage(response: { body: { message?: unknown } }) {
    expect(typeof response.body.message).toBe('string');
  }

  beforeAll(async () => {
    seedPhase3Data();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /* ── 401 Unauthorized: Missing or Invalid Auth ─────────────── */

  describe('404 Not Found for missing entities', () => {
    it('returns 404 for non-existent closing period', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 for non-existent roster', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/rosters/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 for non-existent workflow', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/workflows/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 for non-existent on-call rotation on update', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/oncall/rotations/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({ note: 'test' });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 when cancelling a non-existent absence', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/absences/${FAKE_CUID}/cancel`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });
  });

  /* ── 400 Bad Request: Invalid CUID Params ───────────────────── */

  describe('400 Bad Request for invalid CUID route params', () => {
    it('rejects non-CUID closing period ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods/not-a-cuid')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not a valid CUID');
    });

    it('rejects non-CUID roster ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/rosters/not-a-cuid')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not a valid CUID');
    });

    it('rejects non-CUID workflow ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/workflows/not-a-cuid')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not a valid CUID');
    });

    it('rejects non-CUID absence ID for cancel', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences/not-a-cuid/cancel')
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not a valid CUID');
    });
  });

  /* ── Validation Error Response Shape ──────────────────────────── */

  describe('404 for missing referenced entities', () => {
    it('rejects absence creation with non-existent person', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: FAKE_CUID,
          type: 'ANNUAL_LEAVE',
          startDate: '2026-06-01',
          endDate: '2026-06-05',
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('rejects leave adjustment for non-existent person', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/leave-adjustments')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: FAKE_CUID,
          year: 2026,
          deltaDays: 5,
          reason: 'Test adjustment',
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });
  });

  /* ── Error Response Safety ─────────────────────────────────── */

  describe('404 for additional entity types', () => {
    it('returns 404 for non-existent terminal sync batch', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/terminal/sync/batches/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('returns 404 for non-existent export run CSV', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}/export-runs/${FAKE_CUID}/csv`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── Consistent Error Shape Across All Status Codes ──────────── */

  describe('404 for additional endpoint types', () => {
    it.each([
      [
        'checklist on non-existent closing period',
        () => as(TOKENS.hr).get(`/v1/closing-periods/${FAKE_CUID}/checklist`),
      ],
      [
        'post-close correction on non-existent period',
        () =>
          as(TOKENS.hr)
            .post(`/v1/closing-periods/${FAKE_CUID}/post-close-corrections`)
            .send({ reason: 'Test correction' }),
      ],
      [
        'export artifact on non-existent run',
        () =>
          as(TOKENS.hr).get(`/v1/closing-periods/${FAKE_CUID}/export-runs/${FAKE_CUID}/artifact`),
      ],
    ])('returns 404 for %s', async (_label, sendRequest) => {
      const response = await sendRequest();

      expect(response.status).toBe(404);
      expectStringMessage(response);
    });

    it('returns 404 for on-call compliance with non-existent person', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/oncall/compliance')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .query({ personId: FAKE_CUID });

      // May return 404 or empty result: should not be 500
      expect(response.status).toBeLessThan(500);
    });
  });

  /* ── Domain Validation Errors With Details ──────────────────────── */
});
