import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { ClosingDomainService } from '../../src/phase2/services/closing-domain.service.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('Phase 3 integration: closing, payroll, lifecycle', () => {
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

  it('applies automatic closing cut-off transition', async () => {
    const prisma = app.get(PrismaService);
    const created = await prisma.closingPeriod.create({
      data: {
        organizationUnitId: SEED_IDS.ouAdmin,
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-01-31T23:59:59.000Z'),
        status: 'OPEN',
      },
    });

    const service = app.get(ClosingDomainService);
    const result = await service.runClosingCutoff(new Date('2026-02-10T12:00:00.000Z'));
    expect(result.enabled).toBe(true);
    expect(result.transitioned).toBeGreaterThan(0);

    const updated = await prisma.closingPeriod.findUnique({ where: { id: created.id } });
    expect(updated?.status).toBe('REVIEW');
    expect(updated?.lockSource).toBe('AUTO_CUTOFF');
    expect(updated?.lockedAt).not.toBeNull();
  });

  it('exports canonical payroll CSV and allows csv download', async () => {
    const resolveCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/c000000000000000000000600/decision')
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send({ decision: 'APPROVED', reason: 'Resolved before close' });
    expect(resolveCorrection.status).toBe(201);

    const leadApprove = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/lead-approve`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send();
    expect(leadApprove.status).toBe(201);

    const approve = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/approve`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();
    expect(approve.status).toBe(201);

    const exported = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(exported.status).toBe(201);
    expect(exported.body.csv).toContain('personId,targetHours,actualHours,balance');

    const csv = await request(app.getHttpServer())
      .get(
        `/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${exported.body.exportRun.id}/csv`,
      )
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(csv.status).toBe(200);
    expect(csv.text).toContain('personId,targetHours,actualHours,balance');

    const payrollDownload = await request(app.getHttpServer())
      .get(
        `/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${exported.body.exportRun.id}/csv`,
      )
      .set('Authorization', `Bearer ${TOKENS.payroll}`)
      .send();
    expect(payrollDownload.status).toBe(200);

    const prisma = app.get(PrismaService);
    const downloadAudit = await prisma.auditEntry.findFirst({
      where: {
        action: 'PAYROLL_EXPORT_DOWNLOADED',
        entityType: 'ExportRun',
        entityId: exported.body.exportRun.id,
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(downloadAudit).not.toBeNull();

    const payrollExport = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.payroll}`)
      .send();
    expect(payrollExport.status).toBe(403);
  });

  it('scopes payroll export rows to the closing period organization unit', async () => {
    const prisma = app.get(PrismaService);
    const scopedPeriodId = 'c000000000000000000000771';
    const periodStart = new Date('2026-05-01T00:00:00.000Z');
    const periodEnd = new Date('2026-05-31T23:59:59.000Z');

    await prisma.timeAccount.create({
      data: {
        personId: SEED_IDS.personEmployee,
        periodStart,
        periodEnd,
        targetHours: 160,
        actualHours: 160,
        balance: 0,
        overtimeHours: 0,
      },
    });
    await prisma.timeAccount.create({
      data: {
        personId: SEED_IDS.personPlanner,
        periodStart,
        periodEnd,
        targetHours: 160,
        actualHours: 155,
        balance: -5,
        overtimeHours: 0,
      },
    });

    await prisma.closingPeriod.create({
      data: {
        id: scopedPeriodId,
        organizationUnitId: SEED_IDS.ouAdmin,
        periodStart,
        periodEnd,
        status: 'CLOSED',
        leadApprovedAt: new Date('2026-06-01T09:00:00.000Z'),
        leadApprovedById: SEED_IDS.personLead,
        hrApprovedAt: new Date('2026-06-01T09:05:00.000Z'),
        hrApprovedById: SEED_IDS.personHr,
        closedAt: new Date('2026-06-01T09:05:00.000Z'),
        closedById: SEED_IDS.personHr,
      },
    });

    const exported = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${scopedPeriodId}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ format: 'CSV_V1' });
    expect(exported.status).toBe(201);
    expect(exported.body.rows).toHaveLength(1);
    expect(exported.body.rows[0]?.personId).toBe(SEED_IDS.personEmployee);
    expect(String(exported.body.artifact)).not.toContain(SEED_IDS.personPlanner);
  });

  it('supports multi-format export artifact download and checksum determinism', async () => {
    const csvExport = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ format: 'CSV_V1' });
    expect(csvExport.status).toBe(201);

    const csvExportRepeat = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ format: 'CSV_V1' });
    expect(csvExportRepeat.status).toBe(201);
    expect(csvExportRepeat.body.checksum).toBe(csvExport.body.checksum);

    const xmlExport = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ format: 'XML_V1' });
    expect(xmlExport.status).toBe(201);
    expect(xmlExport.body.checksum).not.toBe(csvExport.body.checksum);

    const artifact = await request(app.getHttpServer())
      .get(
        `/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${xmlExport.body.exportRun.id}/artifact`,
      )
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(artifact.status).toBe(200);
    expect(artifact.text).toContain('<payroll');
  });
  it('lists closing periods, reads details and re-opens review period', async () => {
    const plannerListDenied = await request(app.getHttpServer())
      .get('/v1/closing-periods')
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(plannerListDenied.status).toBe(403);

    const plannerChecklistDenied = await request(app.getHttpServer())
      .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}/checklist`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(plannerChecklistDenied.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get('/v1/closing-periods')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ from: '2026-03', to: '2026-03', organizationUnitId: SEED_IDS.ouAdmin });

    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const detail = await request(app.getHttpServer())
      .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(detail.status).toBe(200);
    expect(['REVIEW', 'EXPORTED']).toContain(detail.body.status);

    if (detail.body.status === 'EXPORTED') {
      const correction = await request(app.getHttpServer())
        .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/post-close-corrections`)
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({ reason: 'Re-open in integration test' });
      expect(correction.status).toBe(201);
    }

    const reopen = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/reopen`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();

    expect(reopen.status).toBe(201);
    expect(reopen.body.status).toBe('OPEN');

    const reopenAsLead = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/reopen`)
      .set('Authorization', `Bearer ${TOKENS.lead}`)
      .send();
    expect(reopenAsLead.status).toBe(403);

    const prisma = app.get(PrismaService);
    const adminReopenPeriodId = 'c000000000000000000000772';
    await prisma.closingPeriod.create({
      data: {
        id: adminReopenPeriodId,
        organizationUnitId: SEED_IDS.ouAdmin,
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T23:59:59.000Z'),
        status: 'REVIEW',
      },
    });

    const reopenAsAdmin = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${adminReopenPeriodId}/reopen`)
      .set('Authorization', `Bearer ${TOKENS.admin}`)
      .send();
    expect(reopenAsAdmin.status).toBe(201);
    expect(reopenAsAdmin.body.status).toBe('OPEN');
  });

  it('restricts closing checklist details to approval-capable roles', async () => {
    const asHr = await request(app.getHttpServer())
      .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}/checklist`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(asHr.status).toBe(200);

    const asEmployee = await request(app.getHttpServer())
      .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}/checklist`)
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    expect(asEmployee.status).toBe(403);
  });
});
