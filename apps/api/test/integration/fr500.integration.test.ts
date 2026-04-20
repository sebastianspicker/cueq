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

  it('rejects workflow policy escalation roles that are invalid for the workflow type', async () => {
    const invalid = await request(app.getHttpServer())
      .put('/v1/workflows/policies/LEAVE_REQUEST')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        escalationDeadlineHours: 12,
        escalationRoles: ['SHIFT_PLANNER'],
        maxDelegationDepth: 4,
      });
    expect(invalid.status).toBe(400);
    expect(String(invalid.body.message)).toContain('cannot be used for workflow type');
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

  it('rejects delegation action to ineligible or unknown delegate targets', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason: 'FR-500 invalid delegation target test',
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

    const delegateToIneligibleRole = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({
        action: 'DELEGATE',
        delegateToId: SEED_IDS.personPlanner,
        reason: 'Invalid delegate role',
      });
    expect(delegateToIneligibleRole.status).toBe(400);

    const delegateToUnknownPerson = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({
        action: 'DELEGATE',
        delegateToId: 'c000000000000000000000999',
        reason: 'Unknown delegate',
      });
    expect(delegateToUnknownPerson.status).toBe(400);
  });

  it('rejects delegation action to self', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason: 'FR-500 self delegation target test',
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

    const selfDelegate = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({
        action: 'DELEGATE',
        delegateToId: SEED_IDS.personLead,
        reason: 'No-op self delegation',
      });
    expect(selfDelegate.status).toBe(400);
    expect(String(selfDelegate.body.message)).toContain('delegate to self');
  });

  it('routes cross-person booking corrections using target-person organization approver context', async () => {
    const prisma = app.get(PrismaService);
    const securityLeadId = 'c000000000000000000000993';

    await prisma.person.upsert({
      where: { id: securityLeadId },
      create: {
        id: securityLeadId,
        externalId: 'lead_security_993',
        firstName: 'Sina',
        lastName: 'Sicherheit',
        email: 'security-lead@cueq.local',
        role: 'TEAM_LEAD',
        organizationUnitId: SEED_IDS.ouSecurity,
      },
      update: {
        role: 'TEAM_LEAD',
        organizationUnitId: SEED_IDS.ouSecurity,
      },
    });

    const booking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-08-04T08:00:00.000Z',
        endTime: '2026-08-04T16:00:00.000Z',
        source: 'WEB',
      });
    expect(booking.status).toBe(201);

    const correction = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        bookingId: booking.body.id,
        reason: 'Cross-person correction should route by booking OU.',
      });
    expect(correction.status).toBe(201);
    expect(correction.body.approverId).toBe(securityLeadId);
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

    const prisma = app.get(PrismaService);
    const planner = await prisma.person.findUnique({
      where: { id: SEED_IDS.personPlanner },
      select: { workTimeModelId: true },
    });
    if (!planner) {
      throw new Error('Expected seeded planner user');
    }

    const swapTargetId = 'c000000000000000000000990';
    await prisma.person.upsert({
      where: { id: swapTargetId },
      create: {
        id: swapTargetId,
        externalId: 'swap_target_990',
        firstName: 'Swap',
        lastName: 'Target',
        email: 'swap-target@cueq.local',
        role: 'EMPLOYEE',
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
      update: {
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
    });

    const created = await request(app.getHttpServer())
      .post('/v1/workflows/shift-swaps')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        shiftId: shift.body.id,
        fromPersonId: SEED_IDS.personPlanner,
        toPersonId: swapTargetId,
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
        startTime: '2026-06-06T08:00:00.000Z',
        endTime: '2026-06-06T16:00:00.000Z',
        shiftType: 'DAY',
        minStaffing: 1,
      });
    expect(shift.status).toBe(201);

    const plannerAssignment = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(plannerAssignment.status).toBe(201);

    const prisma = app.get(PrismaService);
    const planner = await prisma.person.findUnique({
      where: { id: SEED_IDS.personPlanner },
      select: { workTimeModelId: true },
    });
    if (!planner) {
      throw new Error('Expected seeded planner user');
    }

    const swapTargetId = 'c000000000000000000000995';
    await prisma.person.upsert({
      where: { id: swapTargetId },
      create: {
        id: swapTargetId,
        externalId: 'swap_target_995',
        firstName: 'Swap',
        lastName: 'Collision',
        email: 'swap-collision@cueq.local',
        role: 'EMPLOYEE',
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
      update: {
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
    });

    const created = await request(app.getHttpServer())
      .post('/v1/workflows/shift-swaps')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        shiftId: shift.body.id,
        fromPersonId: SEED_IDS.personPlanner,
        toPersonId: swapTargetId,
        reason: 'Swap should fail if target is assigned before approval.',
      });
    expect(created.status).toBe(201);

    const targetAssignment = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: swapTargetId,
      });
    expect(targetAssignment.status).toBe(201);

    const approval = await request(app.getHttpServer())
      .post(`/v1/workflows/${created.body.id}/decision`)
      .set('Authorization', `Bearer ${tokenForPerson(created.body.approverId)}`)
      .send({
        action: 'APPROVE',
        reason: 'Attempting approval after state drift.',
      });
    expect(approval.status).toBe(400);
    expect(String(approval.body.message)).toContain('already exists on shift');

    const detail = await request(app.getHttpServer())
      .get(`/v1/workflows/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenForPerson(created.body.approverId)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('PENDING');
  });

  it('rejects shift swap workflow when toPerson belongs to another organization unit', async () => {
    const roster = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-07-31T23:59:59.000Z',
      });
    expect(roster.status).toBe(201);

    const shift = await request(app.getHttpServer())
      .post(`/v1/rosters/${roster.body.id}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-07-05T08:00:00.000Z',
        endTime: '2026-07-05T16:00:00.000Z',
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
        reason: 'Cross-unit swap attempt',
      });
    expect(created.status).toBe(400);
    expect(String(created.body.message)).toContain('organization unit');
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

  it('rejects overtime approval workflow when no matching time account exists', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/overtime-approvals')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        periodStart: '2030-01-01T00:00:00.000Z',
        periodEnd: '2030-01-31T23:59:59.000Z',
        overtimeHours: 2,
        reason: 'Request should fail without a matching account period.',
      });

    expect(created.status).toBe(400);
    expect(String(created.body.message)).toContain('No matching time account');
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
