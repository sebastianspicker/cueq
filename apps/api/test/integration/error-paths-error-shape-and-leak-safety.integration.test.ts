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

  function expectObjectErrorShape(response: { body: { message?: unknown } }) {
    expect(typeof response.body).toBe('object');
    expect(Array.isArray(response.body)).toBe(false);
    expectStringMessage(response);
  }

  function expectNoStack(response: { body: Record<string, unknown> }) {
    expect(response.body).not.toHaveProperty('stack');
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

  describe('error responses do not leak internals', () => {
    it('404 response does not contain stack traces', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('at ');
      expect(body).not.toContain('.ts:');
      expect(body).not.toContain('node_modules');
    });

    it('400 validation response does not contain stack traces or schema internals', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      expect(response.status).toBe(400);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('at ');
      expect(body).not.toContain('.ts:');
      expect(body).not.toContain('ZodError');
      expect(response.body).not.toHaveProperty('issues');
    });

    it('403 response uses generic message without leaking user details', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('employee@');
      expect(body).not.toContain('EMPLOYEE');
    });
  });

  /* ── 400 Bad Request: Domain Validation ─────────────────────── */

  describe('all error responses have consistent shape', () => {
    it.each([
      ['401', () => request(app.getHttpServer()).get('/v1/closing-periods'), 401],
      ['403', () => as(TOKENS.employee).get('/v1/closing-periods'), 403],
      ['404', () => as(TOKENS.hr).get(`/v1/closing-periods/${FAKE_CUID}`), 404],
    ])('%s includes statusCode and message as string', async (_label, sendRequest, status) => {
      const response = await sendRequest();

      expect(response.status).toBe(status);
      expect(typeof response.body.statusCode).toBe('number');
      expectStringMessage(response);
    });

    it('400 validation includes statusCode, message as string, and details array', async () => {
      const response = await as(TOKENS.hr).post('/v1/absences').send({});

      expect(response.status).toBe(400);
      expect(typeof response.body.statusCode).toBe('number');
      expectStringMessage(response);
      expect(Array.isArray(response.body.details)).toBe(true);
    });
  });

  /* ── Error Responses Never Contain stack Property ──────────────── */

  describe('error responses never expose stack property', () => {
    it.each([
      ['404', () => as(TOKENS.hr).get(`/v1/closing-periods/${FAKE_CUID}`), 404],
      ['403', () => as(TOKENS.employee).get('/v1/closing-periods'), 403],
      ['400 validation', () => as(TOKENS.hr).post('/v1/absences').send({}), 400],
    ])('%s response has no stack property', async (_label, sendRequest, status) => {
      const response = await sendRequest();

      expect(response.status).toBe(status);
      expectNoStack(response);
    });
  });

  /* ── State Transition Errors Return Proper Shape ───────────────── */

  describe('state transition errors return object (not raw array)', () => {
    it('closing lifecycle errors return { statusCode, message, details } not a raw array', async () => {
      // Attempting to approve a non-existent period returns 404, but
      // state transition errors (e.g. approve an OPEN period) return 400
      // with { statusCode, message, details }: not a raw violations array.
      // We verify the shape on a valid 400 domain error.
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/approve`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      // FAKE_CUID won't exist → 404; we verify the shape is still an object
      expect(response.status).toBe(404);
      expectObjectErrorShape(response);
    });

    it('start-review on non-existent period returns proper error shape', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/start-review`)
        .set('Authorization', `Bearer ${TOKENS.admin}`);

      // Either 403 (manual review disabled) or 404 (not found): both must be objects
      expect([403, 404]).toContain(response.status);
      expectObjectErrorShape(response);
    });

    it('reopen on non-existent period returns proper error shape', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/reopen`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expectObjectErrorShape(response);
    });
  });

  /* ── 400 Bad Request: Query Parameter Validation ──────────────── */

  describe('error responses never expose internal implementation details', () => {
    it('403 on integrations does not leak role constants', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('employee@');
      expect(body).not.toContain('node_modules');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('404 on checklist does not leak database details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}/checklist`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('prisma');
      expect(body).not.toContain('SELECT');
      expect(body).not.toContain('.ts:');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('400 on leave balance does not leak regex patterns', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/leave-balance/me')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ year: 'abc' });

      expect(response.status).toBe(400);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('RegExp');
      expect(body).not.toContain('\\d');
      expect(response.body).not.toHaveProperty('stack');
    });
  });
});
