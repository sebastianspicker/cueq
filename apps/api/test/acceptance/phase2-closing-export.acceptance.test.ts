import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

interface ExportRunBody {
  checksum: string;
  csv: string;
  exportRun: { id: string };
}

async function closePeriodForExport(app: INestApplication): Promise<void> {
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
}

async function expectClosedPeriodMutationRejected(app: INestApplication): Promise<void> {
  const response = await request(app.getHttpServer())
    .post('/v1/bookings')
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send({
      personId: SEED_IDS.personEmployee,
      timeTypeId: SEED_IDS.timeTypeWork,
      startTime: '2026-03-12T08:00:00.000Z',
      endTime: '2026-03-12T12:00:00.000Z',
      source: 'MANUAL',
      note: 'Should be blocked by closing lock',
    });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('CLOSING_PERIOD_LOCKED');
}

async function createAndVerifyCsvExport(app: INestApplication): Promise<ExportRunBody> {
  const exportRun = await request(app.getHttpServer())
    .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send();
  expect(exportRun.status).toBe(201);
  expect(exportRun.body).toHaveProperty('checksum');
  expect(exportRun.body).toHaveProperty('exportRun.id');
  expect(exportRun.body).toHaveProperty('csv');

  const body = exportRun.body as ExportRunBody;
  const csvDownload = await request(app.getHttpServer())
    .get(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${body.exportRun.id}/csv`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send();
  expect(csvDownload.status).toBe(200);
  expect(csvDownload.text).toContain('personId,targetHours,actualHours,balance');
  expect(csvDownload.text.trim().split('\n').length).toBeGreaterThanOrEqual(2);
  return body;
}

async function expectIdempotentAndXmlExports(
  app: INestApplication,
  initialExport: ExportRunBody,
): Promise<void> {
  const repeated = await request(app.getHttpServer())
    .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send();
  expect(repeated.status).toBe(201);
  expect(repeated.body.checksum).toBe(initialExport.checksum);
  expect(repeated.body.csv).toBe(initialExport.csv);

  const xml = await request(app.getHttpServer())
    .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/export`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send({ format: 'XML_V1' });
  expect(xml.status).toBe(201);
  expect(xml.body.checksum).not.toBe(initialExport.checksum);

  const artifact = await request(app.getHttpServer())
    .get(
      `/v1/closing-periods/${SEED_IDS.closingPeriod}/export-runs/${xml.body.exportRun.id}/artifact`,
    )
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send();
  expect(artifact.status).toBe(200);
  expect(artifact.text).toContain('<payroll');
}

function approverToken(approverId: string): string {
  if (approverId === SEED_IDS.personLead) {
    return TOKENS.lead;
  }
  return approverId === SEED_IDS.personAdmin ? TOKENS.admin : TOKENS.hr;
}

async function applyPostCloseCorrection(app: INestApplication): Promise<void> {
  const correction = await request(app.getHttpServer())
    .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/post-close-corrections`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send({ reason: 'Payroll mismatch correction' });
  expect(correction.status).toBe(201);

  const approval = await request(app.getHttpServer())
    .post(`/v1/workflows/${correction.body.id}/decision`)
    .set('Authorization', `Bearer ${approverToken(String(correction.body.approverId))}`)
    .send({ action: 'APPROVE', reason: 'Correction approved' });
  expect(approval.status).toBe(201);

  const applied = await request(app.getHttpServer())
    .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/corrections/bookings`)
    .set('Authorization', `Bearer ${TOKENS.hr}`)
    .send({
      workflowId: correction.body.id,
      personId: SEED_IDS.personEmployee,
      timeTypeId: SEED_IDS.timeTypeWork,
      startTime: '2026-03-10T09:00:00.000Z',
      endTime: '2026-03-10T11:00:00.000Z',
      reason: 'Backfill missing booking after payroll check',
    });
  expect(applied.status).toBe(201);
}

async function expectExportChangesAfterCorrection(
  app: INestApplication,
  initialChecksum: string,
): Promise<void> {
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
  expect(exported.body.checksum).not.toBe(initialChecksum);
}

describe('Phase 3 acceptance scenarios (AT-01..AT-08)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AT-06 closing export and HR post-close correction', async () => {
    await closePeriodForExport(app);
    await expectClosedPeriodMutationRejected(app);
    const initialExport = await createAndVerifyCsvExport(app);
    await expectIdempotentAndXmlExports(app, initialExport);
    await applyPostCloseCorrection(app);
    await expectExportChangesAfterCorrection(app, initialExport.checksum);
  });
});
