import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { prisma } from '@cueq/database';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

describe('Phase 2 compliance', () => {
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

  it('denies employee access to HR-only closing approval', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/approve`)
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send();

    expect(response.status).toBe(403);
  });

  it('denies non-assignee HR decisions on team-lead assigned leave workflow', async () => {
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

    const leadInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .set('Authorization', `Bearer ${TOKENS.lead}`);
    const workflow = leadInbox.body.find(
      (entry: { type: string; entityId: string }) =>
        entry.type === 'LEAVE_REQUEST' && entry.entityId === created.body.id,
    );
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected leave workflow');
    }

    const hrDecision = await request(app.getHttpServer())
      .post(`/v1/workflows/${workflow.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ action: 'APPROVE', reason: 'Should be blocked for non-assignee' });

    expect(hrDecision.status).toBe(403);
  });

  it('denies team lead approval on post-close correction workflow', async () => {
    const created = await prisma.workflowInstance.create({
      data: {
        type: 'POST_CLOSE_CORRECTION',
        status: 'PENDING',
        requesterId: SEED_IDS.personHr,
        approverId: SEED_IDS.personHr,
        entityType: 'ClosingPeriod',
        entityId: SEED_IDS.closingPeriod,
        reason: 'Compliance post-close check',
        submittedAt: new Date('2026-03-31T10:00:00.000Z'),
        dueAt: new Date('2026-04-01T10:00:00.000Z'),
      },
    });

    const leadDecision = await request(app.getHttpServer())
      .post(`/v1/workflows/${created.id}/decision`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ action: 'APPROVE', reason: 'Lead cannot approve post-close' });

    expect(leadDecision.status).toBe(403);
  });

  it('denies non-planner roster write access', async () => {
    const payload = {
      organizationUnitId: SEED_IDS.ouSecurity,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T23:59:59.000Z',
    };

    const employee = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send(payload);
    expect(employee.status).toBe(403);

    const lead = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send(payload);
    expect(lead.status).toBe(403);

    const hr = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send(payload);
    expect(hr.status).toBe(403);
  });

  it('denies planner roster writes outside own organization unit', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouAdmin,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      });

    expect(response.status).toBe(403);
  });

  it('redacts absence reason for employee team-calendar view', async () => {
    await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        note: 'Requested leave',
      });

    const response = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01', end: '2026-04-30' })
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    expect(response.status).toBe(200);
    expect(response.body[0]?.type).toBeUndefined();
    expect(response.body[0]?.note).toBeUndefined();
    expect(response.body.every((entry: { status: string }) => entry.status === 'APPROVED')).toBe(
      true,
    );
  });

  it('denies employee access to aggregated reports', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/reports/oe-overtime')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });

    expect(response.status).toBe(403);
  });

  it('denies employee access to time-engine evaluation endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/time-engine/evaluate')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        week: '2026-W10',
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T07:00:00.000Z',
            end: '2026-03-03T08:00:00.000Z',
            type: 'WORK',
          },
        ],
      });

    expect(response.status).toBe(403);
  });

  it('logs report access in append-only audit trail', async () => {
    const report = await request(app.getHttpServer())
      .get('/v1/reports/closing-completion')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(report.status).toBe(200);

    const latestAudit = await prisma.auditEntry.findFirst({
      where: { action: 'REPORT_ACCESSED' },
      orderBy: { timestamp: 'desc' },
    });

    expect(latestAudit).not.toBeNull();
    expect(latestAudit?.entityType).toBe('Report');
  });

  it('writes audit entries for roster mutations', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      });

    expect(created.status).toBe(201);

    const audit = await prisma.auditEntry.findFirst({
      where: {
        action: 'ROSTER_CREATED',
        entityType: 'Roster',
        entityId: created.body.id,
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(audit).not.toBeNull();
  });
});
