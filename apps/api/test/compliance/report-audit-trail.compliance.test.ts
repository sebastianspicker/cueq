import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { AbsenceStatus, AbsenceType, Role, prisma } from '@cueq/database';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

describe('Phase 2 compliance report audit trail', () => {
  let app: INestApplication;

  async function ensureNonSuppressedAdminReportPopulation() {
    await prisma.person.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        id: `c0000000000000000000008${index}`,
        externalId: `report-pop-${index}`,
        firstName: 'Report',
        lastName: `Population${index}`,
        email: `report-pop-${index}@cueq.local`,
        role: Role.EMPLOYEE,
        organizationUnitId: SEED_IDS.ouAdmin,
      })),
      skipDuplicates: true,
    });
    await prisma.absence.createMany({
      data: [
        {
          id: 'c000000000000000000000860',
          personId: 'c00000000000000000000080',
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: new Date('2026-03-10T00:00:00.000Z'),
          endDate: new Date('2026-03-10T00:00:00.000Z'),
          days: 1,
          status: AbsenceStatus.APPROVED,
        },
      ],
      skipDuplicates: true,
    });
  }

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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

  it('redacts absence type buckets for non-HR report readers', async () => {
    await ensureNonSuppressedAdminReportPopulation();

    const response = await request(app.getHttpServer())
      .get('/v1/reports/team-absence')
      .set('Authorization', `Bearer ${TOKENS.worksCouncil}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });

    expect(response.status).toBe(200);
    expect(response.body.suppression.suppressed).toBe(false);
    expect(response.body.totals.requests).toBeGreaterThan(0);
    expect(response.body.buckets).toEqual([]);
  });

  it('keeps absence type buckets visible for HR report readers', async () => {
    await ensureNonSuppressedAdminReportPopulation();

    const response = await request(app.getHttpServer())
      .get('/v1/reports/team-absence')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        organizationUnitId: SEED_IDS.ouAdmin,
        from: '2026-03-01',
        to: '2026-03-31',
      });

    expect(response.status).toBe(200);
    expect(response.body.suppression.suppressed).toBe(false);
    expect(response.body.buckets.length).toBeGreaterThan(0);
    expect(response.body.buckets[0]).toHaveProperty('type');
  });

  it('records booking creation audit entry for dashboard quick action path', async () => {
    const dashboard = await request(app.getHttpServer())
      .get('/v1/dashboard/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send();
    expect(dashboard.status).toBe(200);

    const booking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: dashboard.body.personId,
        timeTypeId: dashboard.body.clockInTimeTypeId,
        startTime: '2026-04-09T08:00:00.000Z',
        source: 'MANUAL',
        note: 'Compliance quick action booking',
      });
    expect(booking.status).toBe(201);

    const latestAudit = await prisma.auditEntry.findFirst({
      where: {
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: booking.body.id,
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(latestAudit).not.toBeNull();
    expect(latestAudit?.entityId).toBe(booking.body.id);
  });

  it('writes audit entries for roster mutations', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-06-30T23:59:59.000Z',
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
