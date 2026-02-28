import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';
const HR_IMPORT_TOKEN = process.env.HR_IMPORT_TOKEN ?? 'dev-hr-token';

describe('Phase 3 integration: terminal, HR import, payroll csv', () => {
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

  it('accepts terminal heartbeat and exposes terminal health', async () => {
    const heartbeat = await request(app.getHttpServer())
      .post('/v1/terminal/heartbeats')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send({
        terminalId: 'T-NEW-01',
        observedAt: '2026-03-12T09:00:00.000Z',
        bufferedRecords: 2,
        errorCount: 0,
      });

    expect(heartbeat.status).toBe(201);
    expect(heartbeat.body.terminalId).toBe('T-NEW-01');

    const health = await request(app.getHttpServer())
      .get('/v1/terminal/health')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send();

    expect(health.status).toBe(200);
    expect(Array.isArray(health.body.terminals)).toBe(true);
    expect(
      health.body.terminals.find((t: { terminalId: string }) => t.terminalId === 'T-NEW-01'),
    ).toBeDefined();
  });

  it('runs file-based HR import and fetches import run', async () => {
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
      'hrimp100,Ina,Import,ina.import@cueq.local,EMPLOYEE,Verwaltung,Gleitzeit Vollzeit,39.83,7.97,lead01',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-phase3.csv',
        csv,
      });

    expect(run.status).toBe(201);
    expect(run.body.status).toBe('SUCCEEDED');
    expect(run.body.totalRows).toBe(1);

    const getRun = await request(app.getHttpServer())
      .get(`/v1/hr/import-runs/${run.body.id}`)
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send();

    expect(getRun.status).toBe(200);
    expect(getRun.body.id).toBe(run.body.id);
  });

  it('exports canonical payroll CSV and allows csv download', async () => {
    const resolveCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/c000000000000000000000600/decision')
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ decision: 'APPROVED', reason: 'Resolved before close' });
    expect(resolveCorrection.status).toBe(201);

    const approve = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/approve`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();
    expect(approve.status).toBe(201);

    const exported = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(exported.status).toBe(201);
    expect(exported.body.csv).toContain('personId,targetHours,actualHours,balance');

    const csv = await request(app.getHttpServer())
      .get(
        `/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${exported.body.exportRun.id}/csv`,
      )
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(csv.status).toBe(200);
    expect(csv.text).toContain('personId,targetHours,actualHours,balance');
  });

  it('serves policy bundle and policy history', async () => {
    const bundle = await request(app.getHttpServer())
      .get('/v1/policies')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ asOf: '2026-03-15' });

    expect(bundle.status).toBe(200);
    expect(bundle.body.policies).toHaveLength(5);

    const history = await request(app.getHttpServer())
      .get('/v1/policies/history')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ type: 'REST_RULE' });

    expect(history.status).toBe(200);
    expect(history.body.total).toBe(1);
    expect(history.body.entries[0].type).toBe('REST_RULE');
  });

  it('evaluates time-engine rules and returns surcharge classification', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/time-engine/evaluate')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        week: '2026-W10',
        targetHours: 0,
        timezone: 'Europe/Berlin',
        holidayDates: [],
        intervals: [
          {
            start: '2026-03-07T21:00:00.000Z',
            end: '2026-03-07T22:00:00.000Z',
            type: 'WORK',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.actualHours).toBe(1);
    expect(response.body.surchargeMinutes).toEqual([
      {
        category: 'WEEKEND',
        ratePercent: 50,
        minutes: 60,
      },
    ]);
  });

  it('supports draft roster lifecycle, assignments, publish gate and plan-vs-actual metrics', async () => {
    const createRoster = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      });

    expect(createRoster.status).toBe(201);

    const rosterId = createRoster.body.id as string;
    const detail = await request(app.getHttpServer())
      .get(`/v1/rosters/${rosterId}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.members)).toBe(true);

    const shift = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-04-05T08:00:00.000Z',
        endTime: '2026-04-05T16:00:00.000Z',
        shiftType: 'EARLY',
        minStaffing: 2,
      });
    expect(shift.status).toBe(201);

    const updatedShift = await request(app.getHttpServer())
      .patch(`/v1/rosters/${rosterId}/shifts/${shift.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        shiftType: 'DAY',
      });
    expect(updatedShift.status).toBe(200);
    expect(updatedShift.body.shiftType).toBe('DAY');

    const shiftToDelete = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-04-06T08:00:00.000Z',
        endTime: '2026-04-06T16:00:00.000Z',
        shiftType: 'EARLY',
        minStaffing: 1,
      });
    expect(shiftToDelete.status).toBe(201);

    const deletedShift = await request(app.getHttpServer())
      .delete(`/v1/rosters/${rosterId}/shifts/${shiftToDelete.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(deletedShift.status).toBe(200);
    expect(deletedShift.body.deleted).toBe(true);

    const assign = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(assign.status).toBe(201);

    const unassign = await request(app.getHttpServer())
      .delete(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments/${assign.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(unassign.status).toBe(200);
    expect(unassign.body.deleted).toBe(true);

    const reassign = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(reassign.status).toBe(201);

    const publishBlocked = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/publish`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(publishBlocked.status).toBe(400);
    const shortfalls =
      publishBlocked.body.shortfalls ?? publishBlocked.body.message?.shortfalls ?? [];
    expect(Array.isArray(shortfalls)).toBe(true);
    expect(shortfalls[0]?.shortfall).toBe(1);

    const reduceMinStaffing = await request(app.getHttpServer())
      .patch(`/v1/rosters/${rosterId}/shifts/${shift.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        minStaffing: 1,
      });
    expect(reduceMinStaffing.status).toBe(200);

    const overlapBooking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-04-05T08:15:00.000Z',
        endTime: '2026-04-05T15:45:00.000Z',
        source: 'WEB',
        shiftId: shift.body.id,
      });
    expect(overlapBooking.status).toBe(201);

    const publish = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/publish`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe('PUBLISHED');

    const planVsActual = await request(app.getHttpServer())
      .get(`/v1/rosters/${rosterId}/plan-vs-actual`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(planVsActual.status).toBe(200);
    expect(planVsActual.body.totalSlots).toBe(1);
    expect(planVsActual.body.mismatchedSlots).toBe(0);
    expect(planVsActual.body.understaffedSlots).toBe(0);
    expect(planVsActual.body.coverageRate).toBe(1);
    expect(planVsActual.body.slots[0].plannedHeadcount).toBe(1);
    expect(planVsActual.body.slots[0].actualHeadcount).toBe(1);
  });

  it('creates and updates on-call rotations and enforces rotation-bound deployment', async () => {
    const createRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-03-16T00:00:00.000Z',
        endTime: '2026-03-22T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });

    expect(createRotation.status).toBe(201);

    const listRotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ personId: SEED_IDS.personItOncall });

    expect(listRotations.status).toBe(200);
    expect(listRotations.body.length).toBeGreaterThan(0);

    const updateRotation = await request(app.getHttpServer())
      .patch(`/v1/oncall/rotations/${createRotation.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        note: 'Updated for integration test',
      });

    expect(updateRotation.status).toBe(200);
    expect(updateRotation.body.note).toBe('Updated for integration test');

    const createDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-20T01:30:00.000Z',
        endTime: '2026-03-20T02:00:00.000Z',
        remote: true,
      });

    expect(createDeployment.status).toBe(201);
  });

  it('lists closing periods, reads details and re-opens review period', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/closing-periods')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ from: '2026-03', to: '2026-03', organizationUnitId: SEED_IDS.ouAdmin });

    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const detail = await request(app.getHttpServer())
      .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(detail.status).toBe(200);
    expect(['REVIEW', 'EXPORTED']).toContain(detail.body.status);

    if (detail.body.status === 'EXPORTED') {
      const correction = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/post-close-corrections`)
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({ reason: 'Re-open in integration test' });
      expect(correction.status).toBe(201);
    }

    const reopen = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/reopen`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(reopen.status).toBe(201);
    expect(reopen.body.status).toBe('OPEN');
  });

  it('enforces report authorization and serves aggregated reports', async () => {
    const denied = await request(app.getHttpServer())
      .get('/v1/reports/team-absence')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(denied.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get('/v1/reports/team-absence')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(allowed.status).toBe(200);
    expect(allowed.body.suppression).toBeDefined();

    const overtime = await request(app.getHttpServer())
      .get('/v1/reports/oe-overtime')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(overtime.status).toBe(200);

    const closing = await request(app.getHttpServer())
      .get('/v1/reports/closing-completion')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(closing.status).toBe(200);
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
});
