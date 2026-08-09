import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

describe('Phase 3 acceptance scenarios (AT-01..AT-08)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AT-03 roster plan-vs-actual is computable', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/rosters/${SEED_IDS.rosterCurrent}/plan-vs-actual`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);

    expect(response.status).toBe(200);
    expect(response.body.totalSlots).toBe(1);
    expect(response.body.mismatchedSlots).toBe(1);
    expect(response.body.understaffedSlots).toBe(1);
    expect(response.body.complianceRate).toBe(0);
    expect(response.body.coverageRate).toBe(0);
    expect(Array.isArray(response.body.slots)).toBe(true);
    expect(response.body.slots[0]).toMatchObject({
      shiftId: SEED_IDS.shiftNight,
      minStaffing: 1,
      assignedHeadcount: 1,
      plannedHeadcount: 1,
      actualHeadcount: 0,
      delta: -1,
      compliant: false,
    });
  });

  it('AT-04 part-time prorated target uses deterministic segments', async () => {
    const prorated = await request(app.getHttpServer())
      .post('/v1/absences/prorated-target')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        month: '2026-04',
        actualHours: 149,
        transitionAdjustmentHours: -0.33,
        segments: [
          { from: '2026-04-01', to: '2026-04-14', weeklyHours: 39.83 },
          { from: '2026-04-15', to: '2026-04-30', weeklyHours: 30 },
        ],
      });

    expect(prorated.status).toBe(201);
    expect(prorated.body.proratedTargetHours).toBe(151.33);

    const beforeDeadline = await request(app.getHttpServer())
      .get('/v1/leave-balance/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ year: 2026, asOfDate: '2026-03-01' });

    const afterDeadline = await request(app.getHttpServer())
      .get('/v1/leave-balance/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ year: 2026, asOfDate: '2026-12-31' });

    expect(beforeDeadline.status).toBe(200);
    expect(beforeDeadline.body.carriedOver).toBeGreaterThan(0);
    expect(beforeDeadline.body.forfeited).toBe(0);

    expect(afterDeadline.status).toBe(200);
    expect(afterDeadline.body.carriedOver).toBeGreaterThan(0);
    expect(afterDeadline.body.forfeited).toBe(afterDeadline.body.carriedOver);
  });

  it('AT-05 on-call compliance validates rest window', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/oncall/compliance')
      .query({
        personId: SEED_IDS.personItOncall,
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      })
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(response.status).toBe(200);
    expect(response.body.compliant).toBe(true);

    // Verify non-compliant path: insufficient rest window
    const nonCompliant = await request(app.getHttpServer())
      .get('/v1/oncall/compliance')
      .query({
        personId: SEED_IDS.personItOncall,
        // Next shift immediately after on-call: no rest window
        nextShiftStart: '2026-03-14T06:00:00.000Z',
      })
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(nonCompliant.status).toBe(200);
    expect(nonCompliant.body.compliant).toBe(false);
  });
});
