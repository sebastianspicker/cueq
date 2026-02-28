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

  it('redacts absence reason for employee team-calendar view', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    expect(response.status).toBe(200);
    expect(response.body[0]?.type).toBeUndefined();
    expect(response.body[0]?.note).toBeUndefined();
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
});
