import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { SEED_IDS, TOKENS } from './fr500-test-support.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('FR-500 integration', () => {
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

  it('rejects cross-unit delegation by shift planners to non-HR/Admin delegates', async () => {
    const prisma = app.get(PrismaService);
    const swapTargetId = 'c000000000000000000000992';
    const crossUnitPlannerId = 'c000000000000000000000994';

    await prisma.person.upsert({
      where: { id: crossUnitPlannerId },
      create: {
        id: crossUnitPlannerId,
        externalId: 'planner_admin_994',
        firstName: 'Paula',
        lastName: 'Querplan',
        email: 'planner-admin@cueq.local',
        role: 'SHIFT_PLANNER',
        organizationUnitId: SEED_IDS.ouAdmin,
      },
      update: {
        role: 'SHIFT_PLANNER',
        organizationUnitId: SEED_IDS.ouAdmin,
      },
    });

    const planner = await prisma.person.findUnique({
      where: { id: SEED_IDS.personPlanner },
      select: { workTimeModelId: true },
    });
    if (!planner) {
      throw new Error('Expected seeded planner user');
    }

    await prisma.person.upsert({
      where: { id: swapTargetId },
      create: {
        id: swapTargetId,
        externalId: 'swap_target_992',
        firstName: 'Swap',
        lastName: 'Target',
        email: 'swap-target-992@cueq.local',
        role: 'EMPLOYEE',
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
      update: {
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
    });

    const roster = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-08-31T23:59:59.000Z',
      });
    expect(roster.status).toBe(201);

    const shift = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-08-06T08:00:00.000Z',
        endTime: '2026-08-06T16:00:00.000Z',
        shiftType: 'DAY',
        minStaffing: 1,
      });
    expect(shift.status).toBe(201);

    const assign = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(assign.status).toBe(201);

    const swap = await request(app.getHttpServer())
      .post('/v1/workflows/shift-swaps')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        shiftId: shift.body.id,
        fromPersonId: SEED_IDS.personPlanner,
        toPersonId: swapTargetId,
        reason: 'Planner delegation scope guard.',
      });
    expect(swap.status).toBe(201);
    expect(swap.body.approverId).toBe(SEED_IDS.personPlanner);

    const delegated = await request(app.getHttpServer())
      .post(`/v1/workflows/${swap.body.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        action: 'DELEGATE',
        delegateToId: crossUnitPlannerId,
        reason: 'Cross-unit planner delegation should fail.',
      });

    expect(delegated.status).toBe(400);
    expect(String(delegated.body.message)).toContain('organization unit');
  });

  it('rejects delegation rules that point to non-approver roles when workflowType is omitted', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personEmployee,
        activeFrom: '2026-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(400);
  });

  it('rejects persistent delegation rules to cross-unit non-HR/Admin delegates', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personPlanner,
        workflowType: 'SHIFT_SWAP',
        organizationUnitId: SEED_IDS.ouAdmin,
        activeFrom: '2026-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('delegated organization unit');
  });

  it('rejects delegation rules with invalid active window', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personHr,
        workflowType: 'LEAVE_REQUEST',
        activeFrom: '2026-02-01T00:00:00.000Z',
        activeTo: '2026-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(400);
  });

  it('rejects delegation updates that produce an invalid active window from partial patches', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personHr,
        workflowType: 'LEAVE_REQUEST',
        activeFrom: '2026-01-01T00:00:00.000Z',
        activeTo: '2026-12-31T00:00:00.000Z',
      });
    expect(created.status).toBe(201);

    const invalidActiveToPatch = await request(app.getHttpServer())
      .patch(`/v1/workflows/delegations/${created.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        activeTo: '2025-12-31T00:00:00.000Z',
      });
    expect(invalidActiveToPatch.status).toBe(400);
    expect(String(invalidActiveToPatch.body.message)).toContain(
      'activeTo must be after activeFrom',
    );

    const invalidActiveFromPatch = await request(app.getHttpServer())
      .patch(`/v1/workflows/delegations/${created.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        activeFrom: '2027-01-01T00:00:00.000Z',
      });
    expect(invalidActiveFromPatch.status).toBe(400);
    expect(String(invalidActiveFromPatch.body.message)).toContain(
      'activeTo must be after activeFrom',
    );
  });

  it('ignores stale delegations when delegate role is no longer eligible', async () => {
    const createdRule = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personHr,
        workflowType: 'LEAVE_REQUEST',
        organizationUnitId: SEED_IDS.ouAdmin,
        activeFrom: '2026-01-01T00:00:00.000Z',
      });
    expect(createdRule.status).toBe(201);

    const prisma = app.get(PrismaService);
    await prisma.person.update({
      where: { id: SEED_IDS.personHr },
      data: { role: 'EMPLOYEE' },
    });

    const absence = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-24',
        endDate: '2026-04-25',
        note: 'Stale delegation role test',
      });
    expect(absence.status).toBe(201);

    const leadInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    expect(leadInbox.status).toBe(200);
    const leadWorkflow = leadInbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === absence.body.id,
    );
    expect(leadWorkflow).toBeDefined();
    expect(leadWorkflow?.approverId).toBe(SEED_IDS.personLead);

    const hrInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(hrInbox.status).toBe(200);
    const hrWorkflow = hrInbox.body.find(
      (entry: { id: string | undefined }) => entry.id === leadWorkflow?.id,
    );
    expect(hrWorkflow).toBeUndefined();
  });
});
