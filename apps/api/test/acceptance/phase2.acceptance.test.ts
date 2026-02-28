import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

describe('Phase 2 acceptance scenarios (AT-01..AT-07)', () => {
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

  it('AT-01 terminal offline sync dedupes, sorts and flags conflicts', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-01',
        sourceFile: 'batch-01.csv',
        records: [
          {
            personId: SEED_IDS.personPlanner,
            timeTypeCode: 'WORK',
            startTime: '2026-03-11T08:00:00.000Z',
            endTime: '2026-03-11T16:00:00.000Z',
          },
          {
            personId: SEED_IDS.personPlanner,
            timeTypeCode: 'WORK',
            startTime: '2026-03-11T08:00:00.000Z',
            endTime: '2026-03-11T16:00:00.000Z',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.duplicates).toBe(1);
    expect(response.body.sorted).toBe(true);
    expect(response.body.conflictFlags.length).toBeGreaterThan(0);
  });

  it('AT-02 correction delegation and inbox flow', async () => {
    const createCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: 'c000000000000000000000400',
        reason: 'Bitte um Korrektur der Startzeit nach Terminalausfall',
      });

    expect(createCorrection.status).toBe(201);

    const inbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);

    expect(inbox.status).toBe(200);
    expect(inbox.body.length).toBeGreaterThan(0);
  });

  it('AT-03 roster plan-vs-actual is computable', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/rosters/${SEED_IDS.rosterCurrent}/plan-vs-actual`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('complianceRate');
  });

  it('AT-04 part-time prorated target uses deterministic segments', async () => {
    const response = await request(app.getHttpServer())
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

    expect(response.status).toBe(201);
    expect(response.body.proratedTargetHours).toBe(151.33);
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
  });

  it('AT-06 closing export and HR post-close correction', async () => {
    const resolveCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/c000000000000000000000600/decision')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ decision: 'APPROVED', reason: 'Resolved before close' });

    expect(resolveCorrection.status).toBe(201);

    const approve = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/approve`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(approve.status).toBe(201);

    const exportRun = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(exportRun.status).toBe(201);
    expect(exportRun.body).toHaveProperty('checksum');

    const correction = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/post-close-corrections`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ reason: 'Payroll mismatch correction' });

    expect(correction.status).toBe(201);
  });

  it('AT-07 team calendar enforces role-based visibility', async () => {
    const employeeView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T23:59:59.000Z' })
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    const leadView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T23:59:59.000Z' })
      .set('Authorization', `Bearer ${TOKENS.lead}`);

    expect(employeeView.status).toBe(200);
    expect(leadView.status).toBe(200);

    expect(employeeView.body[0]?.status).toBe('ABSENT');
    expect(employeeView.body[0]?.type).toBeUndefined();
    expect(leadView.body[0]?.type).toBeDefined();
  });
});
