import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { createFr500TestSupport, SEED_IDS, TOKENS } from './fr500-test-support.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('FR-500 integration', () => {
  let app: INestApplication;
  const { as, createBookingCorrection, decideWorkflow, getInboxWorkflow } = createFr500TestSupport(
    () => app,
  );

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

  it('accepts legacy decision payloads and syncs leave status', async () => {
    const created = await as(TOKENS.employee).post('/v1/absences').send({
      personId: SEED_IDS.personEmployee,
      type: 'ANNUAL_LEAVE',
      startDate: '2026-04-20',
      endDate: '2026-04-22',
      note: 'FR-500 legacy decision',
    });
    expect(created.status).toBe(201);

    const workflow = await getInboxWorkflow(
      TOKENS.lead,
      (entry) => entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );

    const approved = await decideWorkflow(workflow.id, TOKENS.lead, {
      decision: 'APPROVED',
      reason: 'Legacy payload',
    });
    expect(approved.status).toBe(201);

    const mine = await as(TOKENS.employee).get('/v1/absences/me');
    const absence = mine.body.find((entry: { id: string }) => entry.id === created.body.id);
    expect(absence?.status).toBe('APPROVED');
  });

  it('supports action-based delegation and decision', async () => {
    const created = await createBookingCorrection(
      'FR-500 delegation action test',
      TOKENS.employee,
      {
        startTime: '2026-03-02T08:30:00.000Z',
        endTime: '2026-03-02T12:30:00.000Z',
        timeTypeId: SEED_IDS.timeTypePause,
      },
    );
    expect(created.status).toBe(201);

    const workflow = await getInboxWorkflow(
      TOKENS.lead,
      (entry) =>
        entry.type === 'BOOKING_CORRECTION' && entry.entityId === SEED_IDS.bookingEmployeeIn,
      { type: 'BOOKING_CORRECTION' },
    );

    const delegated = await decideWorkflow(workflow.id, TOKENS.lead, {
      action: 'DELEGATE',
      delegateToId: SEED_IDS.personHr,
      reason: 'Delegating to HR',
    });
    expect(delegated.status).toBe(201);
    expect(delegated.body.approverId).toBe(SEED_IDS.personHr);

    const hrWorkflow = await getInboxWorkflow(TOKENS.hr, (entry) => entry.id === workflow.id, {
      type: 'BOOKING_CORRECTION',
    });
    expect(hrWorkflow.availableActions).toContain('APPROVE');

    const approved = await decideWorkflow(workflow.id, TOKENS.hr, {
      action: 'APPROVE',
      reason: 'Approved by HR',
    });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');

    const correctedBooking = await app.get(PrismaService).booking.findUnique({
      where: { id: SEED_IDS.bookingEmployeeIn },
      select: { timeTypeId: true, startTime: true, endTime: true },
    });
    expect(correctedBooking?.timeTypeId).toBe(SEED_IDS.timeTypePause);
    expect(correctedBooking?.startTime.toISOString()).toBe('2026-03-02T08:30:00.000Z');
    expect(correctedBooking?.endTime?.toISOString()).toBe('2026-03-02T12:30:00.000Z');
  });

  it('rejects delegation action to ineligible or unknown delegate targets', async () => {
    const created = await createBookingCorrection('FR-500 invalid delegation target test');
    expect(created.status).toBe(201);

    const workflow = await getInboxWorkflow(
      TOKENS.lead,
      (entry) =>
        entry.type === 'BOOKING_CORRECTION' && entry.entityId === SEED_IDS.bookingEmployeeIn,
      { type: 'BOOKING_CORRECTION' },
    );

    const delegateToIneligibleRole = await decideWorkflow(workflow.id, TOKENS.lead, {
      action: 'DELEGATE',
      delegateToId: SEED_IDS.personPlanner,
      reason: 'Invalid delegate role',
    });
    expect(delegateToIneligibleRole.status).toBe(400);

    const delegateToUnknownPerson = await decideWorkflow(workflow.id, TOKENS.lead, {
      action: 'DELEGATE',
      delegateToId: 'c000000000000000000000999',
      reason: 'Unknown delegate',
    });
    expect(delegateToUnknownPerson.status).toBe(400);
  });

  it('rejects delegation action to self', async () => {
    const created = await createBookingCorrection('FR-500 self delegation target test');
    expect(created.status).toBe(201);

    const workflow = await getInboxWorkflow(
      TOKENS.lead,
      (entry) =>
        entry.type === 'BOOKING_CORRECTION' && entry.entityId === SEED_IDS.bookingEmployeeIn,
      { type: 'BOOKING_CORRECTION' },
    );

    const selfDelegate = await decideWorkflow(workflow.id, TOKENS.lead, {
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
});
