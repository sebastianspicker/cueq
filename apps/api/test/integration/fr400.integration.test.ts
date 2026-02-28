import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

describe('FR-400 integration', () => {
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

  it('routes annual leave requests via workflow and approves them', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-22',
        note: 'Annual leave request',
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('REQUESTED');

    const inbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    const workflow = inbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected leave workflow to exist');
    }

    const approved = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ decision: 'APPROVED', reason: 'Approved' });
    expect(approved.status).toBe(201);

    const mine = await request(app.getHttpServer())
      .get('/v1/absences/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    const absence = mine.body.find((entry: { id: string }) => entry.id === created.body.id);
    expect(absence?.status).toBe('APPROVED');
  });

  it('rejects leave requests through workflow decisions', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-24',
        endDate: '2026-04-24',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('REQUESTED');

    const inbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    const workflow = inbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected leave workflow to exist');
    }

    const rejected = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ decision: 'REJECTED', reason: 'Rejected' });
    expect(rejected.status).toBe(201);

    const mine = await request(app.getHttpServer())
      .get('/v1/absences/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    const absence = mine.body.find((entry: { id: string }) => entry.id === created.body.id);
    expect(absence?.status).toBe('REJECTED');
  });

  it('supports cancellation for requested absences', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-27',
        endDate: '2026-04-27',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('REQUESTED');

    const cancelled = await request(app.getHttpServer())
      .post(`/v1/absences/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send();
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('supports HR leave adjustments and exposes them via leave balance', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/leave-adjustments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personEmployee,
        year: 2026,
        deltaDays: 2.5,
        reason: 'Manual correction',
      });

    expect(created.status).toBe(201);
    expect(created.body.deltaDays).toBe(2.5);

    const listed = await request(app.getHttpServer())
      .get('/v1/leave-adjustments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ personId: SEED_IDS.personEmployee, year: 2026 });

    expect(listed.status).toBe(200);
    expect(listed.body.length).toBeGreaterThan(0);
    expect(listed.body[0].deltaDays).toBe(2.5);

    const balance = await request(app.getHttpServer())
      .get('/v1/leave-balance/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ year: 2026, asOfDate: '2026-12-31' });

    expect(balance.status).toBe(200);
    expect(balance.body.adjustments).toBe(2.5);
    expect(balance.body).toHaveProperty('carriedOverUsed');
    expect(balance.body).toHaveProperty('asOfDate');
  });
});
