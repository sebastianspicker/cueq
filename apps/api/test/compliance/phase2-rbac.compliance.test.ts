import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { ClosingStatus, WorkflowStatus, WorkflowType, prisma } from '@cueq/database';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

describe('Phase 2 compliance RBAC', () => {
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

  it('denies non-HR post-close correction booking application', async () => {
    const workflow = await prisma.workflowInstance.create({
      data: {
        type: WorkflowType.POST_CLOSE_CORRECTION,
        status: WorkflowStatus.APPROVED,
        requesterId: SEED_IDS.personHr,
        approverId: SEED_IDS.personHr,
        entityType: 'ClosingPeriod',
        entityId: SEED_IDS.closingPeriod,
        reason: 'Compliance test workflow',
        submittedAt: new Date('2026-03-31T10:00:00.000Z'),
        dueAt: new Date('2026-04-01T10:00:00.000Z'),
        decidedAt: new Date('2026-03-31T10:05:00.000Z'),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/corrections/bookings`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({
        workflowId: workflow.id,
        personId: SEED_IDS.personEmployee,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-03-10T09:00:00.000Z',
        endTime: '2026-03-10T10:00:00.000Z',
        reason: 'Compliance verification payload',
      });

    expect(response.status).toBe(403);
  });

  it('denies team lead lead-approval outside own organization unit', async () => {
    const foreignClosing = await prisma.closingPeriod.create({
      data: {
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: new Date('2026-05-01T00:00:00.000Z'),
        periodEnd: new Date('2026-05-31T23:59:59.000Z'),
        status: ClosingStatus.REVIEW,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${foreignClosing.id}/lead-approve`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
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

  it('denies unauthorized roster write access while allowing HR override', async () => {
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
    expect(hr.status).toBe(201);
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

  it('enforces restricted access for audit/compliance summary reports', async () => {
    const payrollAudit = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.payroll}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(payrollAudit.status).toBe(403);

    const leadCompliance = await request(app.getHttpServer())
      .get('/v1/reports/compliance-summary')
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(leadCompliance.status).toBe(403);

    const dataProtectionAudit = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.dataProtection}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(dataProtectionAudit.status).toBe(200);

    expect(dataProtectionAudit.body).toHaveProperty('totals');
    expect(dataProtectionAudit.body).not.toHaveProperty('actors');
    expect(dataProtectionAudit.body).not.toHaveProperty('actorIds');

    const worksCouncilCompliance = await request(app.getHttpServer())
      .get('/v1/reports/compliance-summary')
      .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(worksCouncilCompliance.status).toBe(200);
    expect(worksCouncilCompliance.body).toHaveProperty('privacy');
    expect(worksCouncilCompliance.body).toHaveProperty('operations');
  });

  it('enforces custom report builder role gates and aggregate-only output', async () => {
    const employeeOptions = await request(app.getHttpServer())
      .get('/v1/reports/custom/options')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    expect(employeeOptions.status).toBe(403);

    const employeePreview = await request(app.getHttpServer())
      .get('/v1/reports/custom/preview')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({
        reportType: 'TEAM_ABSENCE',
      });
    expect(employeePreview.status).toBe(403);

    const hrPreview = await request(app.getHttpServer())
      .get('/v1/reports/custom/preview')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        reportType: 'TEAM_ABSENCE',
        groupBy: 'ORGANIZATION_UNIT',
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: SEED_IDS.ouAdmin,
        metrics: ['days'],
      });
    expect(hrPreview.status).toBe(200);
    expect(Array.isArray(hrPreview.body.rows)).toBe(true);
    expect(hrPreview.body).not.toHaveProperty('personIds');
  });
});
