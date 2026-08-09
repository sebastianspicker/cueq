import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

describe('Phase 2 compliance Works Council report privacy', () => {
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

  /* ── Works Council (Personalrat) RBAC ───────────────────────────── */

  describe('works council (Personalrat) RBAC and aggregation-threshold enforcement', () => {
    it('denies works council access to individual booking data', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/bookings/${SEED_IDS.bookingEmployeeIn}`)
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`);

      expect(response.status).toBe(403);
    });

    it('denies works council access to individual person details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/persons/${SEED_IDS.personEmployee}`)
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`);

      expect(response.status).toBe(403);
    });

    it('denies works council access to individual absence with reason', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .send({
          personId: SEED_IDS.personEmployee,
          type: 'SICK',
          startDate: '2026-05-12',
          endDate: '2026-05-13',
          note: 'Medical certificate attached',
        });
      expect(created.status).toBe(201);

      const response = await request(app.getHttpServer())
        .get(`/v1/absences/${created.body.id}`)
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`);

      expect(response.status).toBe(403);
    });

    it('suppresses team-absence report when group is below REPORT_MIN_GROUP_SIZE', async () => {
      // ouSecurity has 1 person (SHIFT_PLANNER): always below the default threshold of 5
      const response = await request(app.getHttpServer())
        .get('/v1/reports/team-absence')
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
        .query({
          organizationUnitId: SEED_IDS.ouSecurity,
          from: '2026-03-01',
          to: '2026-03-31',
        });

      expect(response.status).toBe(200);
      expect(response.body.suppression.suppressed).toBe(true);
      expect(response.body.totals.requests).toBe(0);
      expect(response.body.totals.days).toBe(0);
      expect(response.body.buckets).toHaveLength(0);
    });

    it('suppresses overtime report when group is below REPORT_MIN_GROUP_SIZE', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/oe-overtime')
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
        .query({
          organizationUnitId: SEED_IDS.ouSecurity,
          from: '2026-03-01',
          to: '2026-03-31',
        });

      expect(response.status).toBe(200);
      expect(response.body.suppression.suppressed).toBe(true);
      expect(response.body.totals.people).toBe(0);
      expect(response.body.totals.totalOvertimeHours).toBe(0);
    });

    it('includes suppression metadata (minGroupSize and population) in report responses', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/team-absence')
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
        .query({
          organizationUnitId: SEED_IDS.ouSecurity,
          from: '2026-03-01',
          to: '2026-03-31',
        });

      expect(response.status).toBe(200);
      expect(response.body.suppression).toHaveProperty('minGroupSize');
      expect(response.body.suppression).toHaveProperty('population');
      expect(typeof response.body.suppression.minGroupSize).toBe('number');
      expect(response.body.suppression.minGroupSize).toBeGreaterThanOrEqual(5);
    });

    it('grants works council access to compliance summary with aggregate-only output', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/compliance-summary')
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
        .query({ from: '2026-03-01', to: '2026-03-31' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('privacy');
      expect(response.body).toHaveProperty('operations');
      // Must not expose individual actor identifiers
      expect(response.body).not.toHaveProperty('actorIds');
      expect(response.body).not.toHaveProperty('actors');
      expect(response.body.privacy).toHaveProperty('minGroupSize');
      expect(response.body.privacy).toHaveProperty('suppressionRate');
    });

    it('grants works council access to audit summary without exposing actor IDs', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/reports/audit-summary')
        .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
        .query({ from: '2026-03-01', to: '2026-03-31' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totals');
      // uniqueActors is a count: not an array of IDs
      expect(typeof response.body.totals.uniqueActors).toBe('number');
      expect(response.body).not.toHaveProperty('actorIds');
      expect(response.body).not.toHaveProperty('actors');
    });
  });
});
