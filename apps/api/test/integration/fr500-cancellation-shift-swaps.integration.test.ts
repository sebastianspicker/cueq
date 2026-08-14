import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { createFr500TestSupport, SEED_IDS, TOKENS } from './fr500-test-support.js';

describe('FR-500 integration', () => {
  let app: INestApplication;
  const { as, createPlannerRosterShift, decideWorkflow, tokenForPerson, upsertSwapTarget } =
    createFr500TestSupport(() => app);

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

  it('supports requester cancellation action and updates linked leave', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-05-05',
        endDate: '2026-05-05',
      });
    expect(created.status).toBe(201);

    const inbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    const workflow = inbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected leave workflow');
    }

    const cancelled = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        action: 'CANCEL',
        reason: 'Cancelling request',
      });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    const mine = await request(app.getHttpServer())
      .get('/v1/absences/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    const absence = mine.body.find((entry: { id: string }) => entry.id === created.body.id);
    expect(absence?.status).toBe('CANCELLED');
  });

  it('supports shift swap workflow and applies assignment swap on approval', async () => {
    const { roster, shift } = await createPlannerRosterShift({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.000Z',
      shiftStart: '2026-06-05T08:00:00.000Z',
      shiftEnd: '2026-06-05T16:00:00.000Z',
    });

    const swapTargetId = 'c000000000000000000000990';
    await upsertSwapTarget({
      id: swapTargetId,
      externalId: 'swap_target_990',
      lastName: 'Target',
      email: 'swap-target@cueq.local',
    });

    const created = await as(TOKENS.planner).post('/v1/workflows/shift-swaps').send({
      shiftId: shift.body.id,
      fromPersonId: SEED_IDS.personPlanner,
      toPersonId: swapTargetId,
      reason: 'Requesting a shift swap due to availability conflict.',
    });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('SHIFT_SWAP');

    const approval = await decideWorkflow(
      created.body.id,
      tokenForPerson(created.body.approverId),
      {
        action: 'APPROVE',
        reason: 'Approved swap request',
      },
    );
    expect(approval.status).toBe(201);
    expect(approval.body.status).toBe('APPROVED');

    const detail = await as(TOKENS.planner).get(`/v1/rosters/${roster.body.id}`);
    expect(detail.status).toBe(200);
    const updatedShift = detail.body.shifts.find(
      (entry: { id: string }) => entry.id === shift.body.id,
    );
    expect(
      updatedShift.assignments.some(
        (entry: { personId: string }) => entry.personId === swapTargetId,
      ),
    ).toBe(true);
    expect(
      updatedShift.assignments.some(
        (entry: { personId: string }) => entry.personId === SEED_IDS.personPlanner,
      ),
    ).toBe(false);
  });

  it('rejects shift swap approval when target person is already assigned before decision', async () => {
    const { roster, shift } = await createPlannerRosterShift({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T23:59:59.000Z',
      shiftStart: '2026-06-06T08:00:00.000Z',
      shiftEnd: '2026-06-06T16:00:00.000Z',
    });

    const swapTargetId = 'c000000000000000000000995';
    await upsertSwapTarget({
      id: swapTargetId,
      externalId: 'swap_target_995',
      lastName: 'Collision',
      email: 'swap-collision@cueq.local',
    });

    const created = await as(TOKENS.planner).post('/v1/workflows/shift-swaps').send({
      shiftId: shift.body.id,
      fromPersonId: SEED_IDS.personPlanner,
      toPersonId: swapTargetId,
      reason: 'Swap should fail if target is assigned before approval.',
    });
    expect(created.status).toBe(201);

    const targetAssignment = await as(TOKENS.planner)
      .post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`)
      .send({
        personId: swapTargetId,
      });
    expect(targetAssignment.status).toBe(201);

    const approval = await decideWorkflow(
      created.body.id,
      tokenForPerson(created.body.approverId),
      {
        action: 'APPROVE',
        reason: 'Attempting approval after state drift.',
      },
    );
    expect(approval.status).toBe(400);
    expect(String(approval.body.message)).toContain('already exists on shift');

    const detail = await as(tokenForPerson(created.body.approverId)).get(
      `/v1/workflows/${created.body.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('PENDING');
  });

  it('rejects shift swap workflow when toPerson belongs to another organization unit', async () => {
    const { shift } = await createPlannerRosterShift({
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-31T23:59:59.000Z',
      shiftStart: '2026-07-05T08:00:00.000Z',
      shiftEnd: '2026-07-05T16:00:00.000Z',
    });

    const created = await as(TOKENS.planner).post('/v1/workflows/shift-swaps').send({
      shiftId: shift.body.id,
      fromPersonId: SEED_IDS.personPlanner,
      toPersonId: SEED_IDS.personHr,
      reason: 'Cross-unit swap attempt',
    });
    expect(created.status).toBe(400);
    expect(String(created.body.message)).toContain('organization unit');
  });
});
