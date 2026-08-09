import { ClosingStatus } from '@cueq/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('Phase 3 integration: policy, reports', () => {
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

    const forbidden = await request(app.getHttpServer())
      .get('/v1/policies')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ asOf: '2026-03-15' });
    expect(forbidden.status).toBe(403);
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

  it('serves custom report builder options and preview with allowlist enforcement', async () => {
    const prisma = app.get(PrismaService);
    const periodStart = new Date('2026-05-01T00:00:00.000Z');
    const periodEnd = new Date('2026-05-31T23:59:59.000Z');
    for (const period of [
      { organizationUnitId: SEED_IDS.ouAdmin, status: ClosingStatus.EXPORTED },
      { organizationUnitId: SEED_IDS.ouSecurity, status: ClosingStatus.OPEN },
    ]) {
      await prisma.closingPeriod.upsert({
        where: {
          organizationUnitId_periodStart: {
            organizationUnitId: period.organizationUnitId,
            periodStart,
          },
        },
        create: { ...period, periodStart, periodEnd },
        update: { periodEnd, status: period.status },
      });
    }

    const options = await request(app.getHttpServer())
      .get('/v1/reports/custom/options')
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(options.status).toBe(200);
    expect(Array.isArray(options.body.reportTypes)).toBe(true);

    const preview = await request(app.getHttpServer())
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
    expect(preview.status).toBe(200);
    expect(preview.body.reportType).toBe('TEAM_ABSENCE');

    const closingPreview = await request(app.getHttpServer())
      .get('/v1/reports/custom/preview')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        reportType: 'CLOSING_COMPLETION',
        groupBy: 'ORGANIZATION_UNIT',
        from: '2026-05-01',
        to: '2026-05-31',
        organizationUnitId: SEED_IDS.ouAdmin,
        metrics: ['completionRate', 'exported'],
      });
    expect(closingPreview.status).toBe(200);
    expect(closingPreview.body.rows).toEqual([
      {
        group: SEED_IDS.ouAdmin,
        metrics: {
          completionRate: 1,
          exported: 1,
        },
      },
    ]);

    const unsupportedClosingPreview = await request(app.getHttpServer())
      .get('/v1/reports/custom/preview')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        reportType: 'CLOSING_COMPLETION',
        groupBy: 'ORGANIZATION_UNIT',
        from: '2026-05-01',
        to: '2026-05-31',
        metrics: ['completionRate'],
      });
    expect(unsupportedClosingPreview.status).toBe(400);

    const forbiddenMetric = await request(app.getHttpServer())
      .get('/v1/reports/custom/preview')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        reportType: 'TEAM_ABSENCE',
        groupBy: 'ORGANIZATION_UNIT',
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: SEED_IDS.ouAdmin,
        metrics: ['completionRate'],
      });
    expect(forbiddenMetric.status).toBe(400);
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

    const auditSummary = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(auditSummary.status).toBe(200);
    expect(auditSummary.body).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(auditSummary.body.totals.entries).toBeGreaterThan(0);
    expect(Array.isArray(auditSummary.body.byAction)).toBe(true);
    expect(Array.isArray(auditSummary.body.byEntityType)).toBe(true);

    const complianceSummary = await request(app.getHttpServer())
      .get('/v1/reports/compliance-summary')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(complianceSummary.status).toBe(200);
    expect(complianceSummary.body).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(complianceSummary.body.privacy.minGroupSize).toBeGreaterThanOrEqual(5);
    expect(complianceSummary.body.closing.periods).toBeGreaterThanOrEqual(0);

    const dataProtectionAudit = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.dataProtection}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(dataProtectionAudit.status).toBe(200);

    const worksCouncilCompliance = await request(app.getHttpServer())
      .get('/v1/reports/compliance-summary')
      .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(worksCouncilCompliance.status).toBe(200);

    const payrollAuditDenied = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.payroll}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(payrollAuditDenied.status).toBe(403);

    const leadAuditDenied = await request(app.getHttpServer())
      .get('/v1/reports/audit-summary')
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .query({
        from: '2026-03-01',
        to: '2026-03-31',
      });
    expect(leadAuditDenied.status).toBe(403);
  });
});
