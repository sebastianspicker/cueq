import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';
import { WorkflowRuntimeService } from '../../src/phase2/workflow-runtime.service';
import { PrismaService } from '../../src/persistence/prisma.service';

describe('FR-500 integration', () => {
  let app: INestApplication;

  function tokenForPerson(personId: string | null | undefined) {
    if (personId === SEED_IDS.personLead) {
      return TOKENS.lead;
    }
    if (personId === SEED_IDS.personHr) {
      return TOKENS.hr;
    }
    if (personId === SEED_IDS.personAdmin) {
      return TOKENS.admin;
    }
    if (personId === SEED_IDS.personPlanner) {
      return TOKENS.planner;
    }
    return TOKENS.hr;
  }

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

  it('supports workflow policy list and upsert for HR', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/workflows/policies')
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((entry: { type: string }) => entry.type === 'LEAVE_REQUEST')).toBe(true);

    const updated = await request(app.getHttpServer())
      .put('/v1/workflows/policies/BOOKING_CORRECTION')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        escalationDeadlineHours: 12,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 4,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.escalationDeadlineHours).toBe(12);
    expect(updated.body.maxDelegationDepth).toBe(4);
  });

  it('supports workflow delegation CRUD for HR', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/delegations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        delegatorId: SEED_IDS.personLead,
        delegateId: SEED_IDS.personHr,
        workflowType: 'LEAVE_REQUEST',
        organizationUnitId: SEED_IDS.ouAdmin,
        activeFrom: '2026-01-01T00:00:00.000Z',
        priority: 2,
      });
    expect(created.status).toBe(201);
    expect(created.body.delegatorId).toBe(SEED_IDS.personLead);

    const listed = await request(app.getHttpServer())
      .get('/v1/workflows/delegations')
      .query({ delegatorId: SEED_IDS.personLead, workflowType: 'LEAVE_REQUEST' })
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(listed.status).toBe(200);
    expect(listed.body.some((entry: { id: string }) => entry.id === created.body.id)).toBe(true);

    const patched = await request(app.getHttpServer())
      .patch(`/v1/workflows/delegations/${created.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ priority: 9, isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.priority).toBe(9);
    expect(patched.body.isActive).toBe(false);

    const removed = await request(app.getHttpServer())
      .delete(`/v1/workflows/delegations/${created.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);
  });

  it('accepts legacy decision payloads and syncs leave status', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-22',
        note: 'FR-500 legacy decision',
      });
    expect(created.status).toBe(201);

    const inbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    const workflow = inbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected leave workflow');
    }

    const approved = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ decision: 'APPROVED', reason: 'Legacy payload' });
    expect(approved.status).toBe(201);

    const mine = await request(app.getHttpServer())
      .get('/v1/absences/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    const absence = mine.body.find((entry: { id: string }) => entry.id === created.body.id);
    expect(absence?.status).toBe('APPROVED');
  });

  it('supports action-based delegation and decision', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason: 'FR-500 delegation action test',
      });
    expect(created.status).toBe(201);

    const leadInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    const workflow = leadInbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'BOOKING_CORRECTION' && entry.entityId === SEED_IDS.bookingEmployeeIn,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected correction workflow');
    }

    const delegated = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({
        action: 'DELEGATE',
        delegateToId: SEED_IDS.personHr,
        reason: 'Delegating to HR',
      });
    expect(delegated.status).toBe(201);
    expect(delegated.body.approverId).toBe(SEED_IDS.personHr);

    const hrInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    const hrWorkflow = hrInbox.body.find((entry: { id: string }) => entry.id === workflow.id);
    expect(hrWorkflow).toBeDefined();
    expect(hrWorkflow.availableActions).toContain('APPROVE');

    const approved = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        action: 'APPROVE',
        reason: 'Approved by HR',
      });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');
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
    const roster = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z',
      });
    expect(roster.status).toBe(201);

    const shift = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-06-05T08:00:00.000Z',
        endTime: '2026-06-05T16:00:00.000Z',
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

    const created = await request(app.getHttpServer())
      .post('/v1/workflows/shift-swaps')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        shiftId: shift.body.id,
        fromPersonId: SEED_IDS.personPlanner,
        toPersonId: SEED_IDS.personHr,
        reason: 'Requesting a shift swap due to availability conflict.',
      });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('SHIFT_SWAP');

    const approval = await request(app.getHttpServer())
      .post(`/v1/workflows/${created.body.id}/decision`)
      .set('Authorization', `Bearer ${tokenForPerson(created.body.approverId)}`)
      .send({
        action: 'APPROVE',
        reason: 'Approved swap request',
      });
    expect(approval.status).toBe(201);
    expect(approval.body.status).toBe('APPROVED');

    const detail = await request(app.getHttpServer())
      .get(`/v1/rosters/${roster.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(detail.status).toBe(200);
    const updatedShift = detail.body.shifts.find(
      (entry: { id: string }) => entry.id === shift.body.id,
    );
    expect(
      updatedShift.assignments.some(
        (entry: { personId: string }) => entry.personId === SEED_IDS.personHr,
      ),
    ).toBe(true);
    expect(
      updatedShift.assignments.some(
        (entry: { personId: string }) => entry.personId === SEED_IDS.personPlanner,
      ),
    ).toBe(false);
  });

  it('supports overtime approval workflow and updates overtime hours on approval', async () => {
    const prisma = app.get(PrismaService);
    const baseline = await prisma.timeAccount.findFirst({
      where: { personId: SEED_IDS.personEmployee },
      orderBy: { periodStart: 'desc' },
    });
    if (!baseline) {
      throw new Error('Expected seeded time account');
    }

    const created = await request(app.getHttpServer())
      .post('/v1/workflows/overtime-approvals')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        periodStart: baseline.periodStart.toISOString(),
        periodEnd: baseline.periodEnd.toISOString(),
        overtimeHours: 1.5,
        reason: 'Requesting overtime approval for month-end support.',
      });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('OVERTIME_APPROVAL');

    const approval = await request(app.getHttpServer())
      .post(`/v1/workflows/${created.body.id}/decision`)
      .set('Authorization', `Bearer ${tokenForPerson(created.body.approverId)}`)
      .send({
        action: 'APPROVE',
        reason: 'Approved overtime',
      });
    expect(approval.status).toBe(201);

    const updated = await prisma.timeAccount.findUnique({
      where: { id: baseline.id },
    });
    expect(Number(updated?.overtimeHours ?? 0)).toBe(
      Number(Number(baseline.overtimeHours).toFixed(2)) + 1.5,
    );
  });

  it('escalates overdue workflows exactly once per overdue instance', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason: 'Escalation idempotency test',
      });
    expect(created.status).toBe(201);

    const prisma = app.get(PrismaService);
    await prisma.workflowInstance.update({
      where: { id: created.body.id },
      data: {
        status: 'PENDING',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const runtime = app.get(WorkflowRuntimeService);
    const first = await runtime.escalateOverdueWorkflows(new Date('2026-12-31T00:00:00.000Z'));
    const second = await runtime.escalateOverdueWorkflows(new Date('2026-12-31T00:00:00.000Z'));

    expect(first.escalated).toBeGreaterThan(0);
    expect(second.escalated).toBe(0);

    const escalated = await prisma.workflowInstance.findUnique({
      where: { id: created.body.id },
    });
    expect(escalated?.status).toBe('ESCALATED');
    expect(escalated?.escalationLevel).toBe(1);
    expect(escalated?.escalatedAt).not.toBeNull();
  });
});
