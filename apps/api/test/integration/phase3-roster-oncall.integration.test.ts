import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

async function createDraftRosterAndShift(app: INestApplication) {
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
  return { rosterId, shiftId: shift.body.id as string };
}

async function assignPublishAndVerify(app: INestApplication, rosterId: string, shiftId: string) {
  const assign = await request(app.getHttpServer())
    .post(`/v1/rosters/${rosterId}/shifts/${shiftId}/assignments`)
    .set('Authorization', `Bearer ${TOKENS.planner}`)
    .send({
      personId: SEED_IDS.personPlanner,
    });
  expect(assign.status).toBe(201);

  const unassign = await request(app.getHttpServer())
    .delete(`/v1/rosters/${rosterId}/shifts/${shiftId}/assignments/${assign.body.id}`)
    .set('Authorization', `Bearer ${TOKENS.planner}`);
  expect(unassign.status).toBe(200);
  expect(unassign.body.deleted).toBe(true);

  const reassign = await request(app.getHttpServer())
    .post(`/v1/rosters/${rosterId}/shifts/${shiftId}/assignments`)
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
    .patch(`/v1/rosters/${rosterId}/shifts/${shiftId}`)
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
      shiftId: shiftId,
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
}

describe('Phase 3 integration: roster, on-call, and booking boundaries', () => {
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
  it('supports draft roster lifecycle, assignments, publish gate and plan-vs-actual metrics', async () => {
    const { rosterId, shiftId } = await createDraftRosterAndShift(app);
    await assignPublishAndVerify(app, rosterId, shiftId);
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

    const listDeploymentsHr = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ personId: SEED_IDS.personItOncall });
    expect(listDeploymentsHr.status).toBe(200);
    expect(listDeploymentsHr.body.length).toBeGreaterThan(0);

    const listDeploymentsEmployee = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    expect(listDeploymentsEmployee.status).toBe(200);
    expect(Array.isArray(listDeploymentsEmployee.body)).toBe(true);

    const duplicateDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-20T01:30:00.000Z',
        endTime: '2026-03-20T02:00:00.000Z',
        remote: true,
      });
    expect(duplicateDeployment.status).toBe(409);
  });

  it('rejects booking intervals where endTime is before startTime', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personEmployee,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-03-20T16:00:00.000Z',
        endTime: '2026-03-20T08:00:00.000Z',
        source: 'WEB',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('endTime must be after startTime');
  });

  it('rejects integration-reserved booking sources on authenticated booking endpoint', async () => {
    for (const source of ['IMPORT', 'TERMINAL']) {
      const response = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: SEED_IDS.personEmployee,
          timeTypeId: SEED_IDS.timeTypeWork,
          startTime: '2026-03-20T08:00:00.000Z',
          endTime: '2026-03-20T16:00:00.000Z',
          source,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'Booking source IMPORT/TERMINAL is reserved for integration ingestion paths.',
      );
    }
  });

  it('includes overlapping on-call rotations and deployments when filtering by from/to', async () => {
    const rotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-09-01T00:00:00.000Z',
        endTime: '2026-09-30T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(rotation.status).toBe(201);

    const deployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: rotation.body.id,
        startTime: '2026-09-10T01:00:00.000Z',
        endTime: '2026-09-10T03:00:00.000Z',
        remote: true,
      });
    expect(deployment.status).toBe(201);

    const rotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-15T00:00:00.000Z',
        to: '2026-09-15T23:59:59.000Z',
      });
    expect(rotations.status).toBe(200);
    expect(rotations.body.some((entry: { id: string }) => entry.id === rotation.body.id)).toBe(
      true,
    );

    const deployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-10T02:00:00.000Z',
        to: '2026-09-10T02:30:00.000Z',
      });
    expect(deployments.status).toBe(200);
    expect(deployments.body.some((entry: { id: string }) => entry.id === deployment.body.id)).toBe(
      true,
    );
  });

  it('rejects on-call list queries where from is after to', async () => {
    const rotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-10T00:00:00.000Z',
      });
    expect(rotations.status).toBe(400);
    expect(String(rotations.body.message)).toContain('from must be on or before to');

    const deployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-10T00:00:00.000Z',
      });
    expect(deployments.status).toBe(400);
    expect(String(deployments.body.message)).toContain('from must be on or before to');
  });

  it('enforces organization-unit scope for shift planner on on-call endpoints', async () => {
    const itRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-04-06T00:00:00.000Z',
        endTime: '2026-04-12T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(itRotation.status).toBe(201);

    const crossOuCreate = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-04-13T00:00:00.000Z',
        endTime: '2026-04-19T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(crossOuCreate.status).toBe(403);

    const crossOuUpdate = await request(app.getHttpServer())
      .patch(`/v1/oncall/rotations/${itRotation.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        note: 'planner cross-ou edit should fail',
      });
    expect(crossOuUpdate.status).toBe(403);

    const listRotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .query({ organizationUnitId: SEED_IDS.ouIt });
    expect(listRotations.status).toBe(200);
    expect(
      listRotations.body.some((entry: { id: string }) => entry.id === itRotation.body.id),
    ).toBe(false);

    const itDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: itRotation.body.id,
        startTime: '2026-04-10T01:00:00.000Z',
        endTime: '2026-04-10T01:30:00.000Z',
        remote: true,
      });
    expect(itDeployment.status).toBe(201);

    const listDeployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .query({ personId: SEED_IDS.personItOncall });
    expect(listDeployments.status).toBe(200);
    expect(
      listDeployments.body.some((entry: { id: string }) => entry.id === itDeployment.body.id),
    ).toBe(false);
  });

  it('rejects on-call rotation with person/organization-unit mismatch', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouAdmin,
        startTime: '2026-03-23T00:00:00.000Z',
        endTime: '2026-03-29T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('organizationUnitId must match');
  });

  it('rejects on-call deployment with end time before start time', async () => {
    const createRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-04-05T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(createRotation.status).toBe(201);

    const createDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-31T10:00:00.000Z',
        endTime: '2026-03-31T09:00:00.000Z',
        remote: true,
      });

    expect(createDeployment.status).toBe(400);
  });
});
