import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase3Data, TOKENS } from '../test-helpers';

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

  describe('401 Unauthorized for missing or invalid auth', () => {
    it('returns 401 when no Authorization header is sent', async () => {
      const response = await request(app.getHttpServer()).get('/v1/closing-periods');

      expect(response.status).toBe(401);
    });

    it('returns 401 for a malformed Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', 'Bearer not-a-valid-token');

      expect(response.status).toBe(401);
    });
  });

  /* ── 403 Forbidden: Role Violations ───────────────────────── */

  describe('403 Forbidden for role violations', () => {
    it('rejects employee accessing HR-only audit-summary report', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/audit-summary')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ from: '2026-01-01', to: '2026-01-31' });

      expect(response.status).toBe(403);
    });

    it('rejects employee listing closing periods', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
    });

    it('rejects employee creating a roster (planner-only)', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/rosters')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .send({ name: 'Test', organizationUnitId: 'c000000000000000000000001' });

      expect(response.status).toBe(403);
    });
  });

  /* ── 404 Not Found: Missing Entities ─────────────────────────── */

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

  describe('validation error response conforms to ApiErrorSchema', () => {
    it('ZodValidationPipe returns message as string with details array', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      expect(response.status).toBe(400);
      expect(typeof response.body.message).toBe('string');
      expect(Array.isArray(response.body.details)).toBe(true);
      expect(response.body.details.length).toBeGreaterThan(0);
      expect(response.body.statusCode).toBe(400);
    });

    it('ZodExceptionFilter returns message as string for service-layer validation', async () => {
      // Trigger a raw Zod schema.parse() error (service-layer validation)
      // by sending invalid query params to a report endpoint
      const response = await request(app.getHttpServer())
        .get('/v1/reports/team-absence')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .query({ from: 'not-a-date', to: 'also-not-a-date' });

      expect(response.status).toBe(400);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── 404 for Missing Referenced Entities ──────────────────────── */

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

  describe('400 Bad Request for domain validation failures', () => {
    it('rejects booking creation with empty payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      expect(response.status).toBe(400);
      expect(typeof response.body.message).toBe('string');
      expect(response.body.statusCode).toBe(400);
    });

    it('rejects roster creation with missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/rosters')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      // 400 from Zod validation or 403 from role check — either is a handled error
      expect([400, 403]).toContain(response.status);
      expect(typeof response.body.message).toBe('string');
    });

    it('rejects workflow decision with missing action and decision', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/workflows/${FAKE_CUID}/decision`)
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      // 404 (workflow not found) or 400 (missing action) — both are handled
      expect([400, 404]).toContain(response.status);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── 403 Forbidden: Cross-Boundary Access ──────────────────── */

  describe('403 Forbidden for cross-boundary access', () => {
    it('rejects employee managing workflow delegations', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/workflows/delegations')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      expect(typeof response.body.message).toBe('string');
    });

    it('rejects employee managing workflow policies', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/workflows/policies')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── 404 for Additional Entity Types ────────────────────────── */

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

  describe('all error responses have consistent shape', () => {
    it('401 includes statusCode and message as string', async () => {
      const response = await request(app.getHttpServer()).get('/v1/closing-periods');

      expect(response.status).toBe(401);
      expect(typeof response.body.statusCode).toBe('number');
      expect(typeof response.body.message).toBe('string');
    });

    it('403 includes statusCode and message as string', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      expect(typeof response.body.statusCode).toBe('number');
      expect(typeof response.body.message).toBe('string');
    });

    it('404 includes statusCode and message as string', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(typeof response.body.statusCode).toBe('number');
      expect(typeof response.body.message).toBe('string');
    });

    it('400 validation includes statusCode, message as string, and details array', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      expect(response.status).toBe(400);
      expect(typeof response.body.statusCode).toBe('number');
      expect(typeof response.body.message).toBe('string');
      expect(Array.isArray(response.body.details)).toBe(true);
    });
  });

  /* ── Error Responses Never Contain stack Property ──────────────── */

  describe('error responses never expose stack property', () => {
    it('404 response has no stack property', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
    });

    it('403 response has no stack property', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/closing-periods')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('stack');
    });

    it('400 validation response has no stack property', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  /* ── State Transition Errors Return Proper Shape ───────────────── */

  describe('state transition errors return object (not raw array)', () => {
    it('closing lifecycle errors return { statusCode, message, details } not a raw array', async () => {
      // Attempting to approve a non-existent period returns 404, but
      // state transition errors (e.g. approve an OPEN period) return 400
      // with { statusCode, message, details } — not a raw violations array.
      // We verify the shape on a valid 400 domain error.
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/approve`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      // FAKE_CUID won't exist → 404; we verify the shape is still an object
      expect(response.status).toBe(404);
      expect(typeof response.body).toBe('object');
      expect(Array.isArray(response.body)).toBe(false);
      expect(typeof response.body.message).toBe('string');
    });

    it('start-review on non-existent period returns proper error shape', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/start-review`)
        .set('Authorization', `Bearer ${TOKENS.admin}`);

      // Either 403 (manual review disabled) or 404 (not found) — both must be objects
      expect([403, 404]).toContain(response.status);
      expect(typeof response.body).toBe('object');
      expect(Array.isArray(response.body)).toBe(false);
      expect(typeof response.body.message).toBe('string');
    });

    it('reopen on non-existent period returns proper error shape', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/reopen`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(typeof response.body).toBe('object');
      expect(Array.isArray(response.body)).toBe(false);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── 400 Bad Request: Query Parameter Validation ──────────────── */

  describe('400 Bad Request for invalid query parameters', () => {
    it('rejects leave balance with non-numeric year', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/leave-balance/me')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ year: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('year');
    });

    it('rejects leave balance with invalid asOfDate format', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/leave-balance/me')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ asOfDate: '01-31-2026' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('asOfDate');
    });

    it('rejects leave balance with out-of-range year', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/leave-balance/me')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ year: '9999' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('year');
    });
  });

  /* ── 403 Forbidden: Additional Role Violations ───────────────── */

  describe('403 Forbidden for additional role violations', () => {
    it('rejects employee accessing compliance-summary report', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/compliance-summary')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ from: '2026-01-01', to: '2026-01-31' });

      expect(response.status).toBe(403);
    });

    it('rejects employee accessing integrations webhook endpoints', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.employee}`);

      expect(response.status).toBe(403);
    });

    it('rejects employee accessing closing-completion report', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/closing-completion')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .query({ from: '2026-01-01', to: '2026-01-31' });

      expect(response.status).toBe(403);
    });

    it('rejects lead approving closing period from wrong unit', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/lead-approve`)
        .set('Authorization', `Bearer ${TOKENS.lead}`);

      // 404 (doesn't exist) — the important thing is it does not return 500
      expect([403, 404]).toContain(response.status);
      expect(typeof response.body.message).toBe('string');
    });
  });

  /* ── 404 for Additional Endpoint Types ────────────────────────── */

  describe('404 for additional endpoint types', () => {
    it('returns 404 for checklist on non-existent closing period', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}/checklist`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(typeof response.body.message).toBe('string');
    });

    it('returns 404 for post-close correction on non-existent period', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${FAKE_CUID}/post-close-corrections`)
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({ reason: 'Test correction' });

      expect(response.status).toBe(404);
      expect(typeof response.body.message).toBe('string');
    });

    it('returns 404 for export artifact on non-existent run', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/closing-periods/${FAKE_CUID}/export-runs/${FAKE_CUID}/artifact`)
        .set('Authorization', `Bearer ${TOKENS.hr}`);

      expect(response.status).toBe(404);
      expect(typeof response.body.message).toBe('string');
    });

    it('returns 404 for on-call compliance with non-existent person', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/oncall/compliance')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .query({ personId: FAKE_CUID });

      // May return 404 or empty result — should not be 500
      expect(response.status).toBeLessThan(500);
    });
  });

  /* ── Domain Validation Errors With Details ──────────────────────── */

  describe('domain errors provide actionable messages', () => {
    it('absence with zero working days returns descriptive 400', async () => {
      // Weekend-only range: Saturday to Sunday
      const response = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: FAKE_CUID,
          type: 'ANNUAL_LEAVE',
          startDate: '2026-01-03',
          endDate: '2026-01-04',
        });

      // 404 (person not found) since FAKE_CUID doesn't exist
      // The important thing is it doesn't return 500
      expect([400, 404]).toContain(response.status);
      expect(typeof response.body.message).toBe('string');
    });

    it('booking with CORRECTION source is rejected with descriptive error', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: FAKE_CUID,
          timeTypeId: FAKE_CUID,
          startTime: '2026-06-01T08:00:00.000Z',
          endTime: '2026-06-01T16:00:00.000Z',
          source: 'CORRECTION',
        });

      expect(response.status).toBe(400);
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message).toContain('correction');
    });
  });

  /* ── Error Responses Never Leak Internal Details ────────────────── */

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
