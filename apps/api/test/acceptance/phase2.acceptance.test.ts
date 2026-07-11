import { execSync } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

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

  it('AT-01 terminal offline sync dedupes, sorts and flags conflicts', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-01',
        sourceFile: 'batch-01.csv',
        records: [
          {
            personId: SEED_IDS.personPlanner,
            timeTypeCode: 'WORK',
            startTime: '2026-03-15T08:00:00.000Z',
            endTime: '2026-03-15T16:00:00.000Z',
          },
          {
            personId: SEED_IDS.personPlanner,
            timeTypeCode: 'WORK',
            startTime: '2026-03-15T08:00:00.000Z',
            endTime: '2026-03-15T16:00:00.000Z',
          },
          {
            personId: SEED_IDS.personEmployee,
            timeTypeCode: 'WORK',
            startTime: '2026-04-10T08:00:00.000Z',
            endTime: '2026-04-10T16:00:00.000Z',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.duplicates).toBe(1);
    expect(response.body.sorted).toBe(true);
    expect(response.body.conflictFlags.length).toBeGreaterThan(0);
    expect(response.body.batchId).toBeTruthy();
    expect(response.body.created).toBe(1);

    // Verify the batch detail is retrievable and contains records
    const detail = await request(app.getHttpServer())
      .get(`/v1/terminal/sync/batches/${response.body.batchId}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(detail.status).toBe(200);
    expect(detail.body.terminalId).toBe('T-01');
  });

  it('AT-02 correction delegation and inbox flow', async () => {
    const createCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: 'c000000000000000000000400',
        reason: 'Bitte um Korrektur der Startzeit nach Terminalausfall',
      });

    expect(createCorrection.status).toBe(201);
    expect(createCorrection.body.status).toBe('PENDING');
    expect(createCorrection.body).toHaveProperty('dueAt');

    const initialApproverId = createCorrection.body.approverId as string | null;
    expect(initialApproverId).toBeTruthy();

    const initialApproverToken =
      initialApproverId === SEED_IDS.personLead
        ? TOKENS.lead
        : initialApproverId === SEED_IDS.personHr
          ? TOKENS.hr
          : TOKENS.admin;

    const initialInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${initialApproverToken}`);

    expect(initialInbox.status).toBe(200);
    const workflow = initialInbox.body.find(
      (entry: { id: string }) => entry.id === createCorrection.body.id,
    );
    expect(workflow).toBeDefined();
    expect(workflow?.availableActions).toContain('DELEGATE');

    const delegateToId =
      initialApproverId === SEED_IDS.personLead ? SEED_IDS.personHr : SEED_IDS.personLead;
    const delegatedInboxToken = delegateToId === SEED_IDS.personLead ? TOKENS.lead : TOKENS.hr;

    const delegated = await request(app.getHttpServer())
      .post(`/v1/workflows/${createCorrection.body.id}/decision`)
      .set('Authorization', `Bearer ${initialApproverToken}`)
      .send({
        action: 'DELEGATE',
        delegateToId,
        reason: 'Delegate for approval continuity',
      });

    expect(delegated.status).toBe(201);
    expect(delegated.body.approverId).toBe(delegateToId);

    const delegatedInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${delegatedInboxToken}`);
    const delegatedWorkflow = delegatedInbox.body.find(
      (entry: { id: string }) => entry.id === createCorrection.body.id,
    );
    expect(delegatedWorkflow).toBeDefined();
    expect(delegatedWorkflow?.isOverdue).toBe(false);
  });

  it('AT-03 roster plan-vs-actual is computable', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/rosters/${SEED_IDS.rosterCurrent}/plan-vs-actual`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);

    expect(response.status).toBe(200);
    expect(response.body.totalSlots).toBe(1);
    expect(response.body.mismatchedSlots).toBe(1);
    expect(response.body.understaffedSlots).toBe(1);
    expect(response.body.complianceRate).toBe(0);
    expect(response.body.coverageRate).toBe(0);
    expect(Array.isArray(response.body.slots)).toBe(true);
    expect(response.body.slots[0]).toMatchObject({
      shiftId: SEED_IDS.shiftNight,
      minStaffing: 1,
      assignedHeadcount: 1,
      plannedHeadcount: 1,
      actualHeadcount: 0,
      delta: -1,
      compliant: false,
    });
  });

  it('AT-04 part-time prorated target uses deterministic segments', async () => {
    const prorated = await request(app.getHttpServer())
      .post('/v1/absences/prorated-target')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        month: '2026-04',
        actualHours: 149,
        transitionAdjustmentHours: -0.33,
        segments: [
          { from: '2026-04-01', to: '2026-04-14', weeklyHours: 39.83 },
          { from: '2026-04-15', to: '2026-04-30', weeklyHours: 30 },
        ],
      });

    expect(prorated.status).toBe(201);
    expect(prorated.body.proratedTargetHours).toBe(151.33);

    const beforeDeadline = await request(app.getHttpServer())
      .get('/v1/leave-balance/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ year: 2026, asOfDate: '2026-03-01' });

    const afterDeadline = await request(app.getHttpServer())
      .get('/v1/leave-balance/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .query({ year: 2026, asOfDate: '2026-12-31' });

    expect(beforeDeadline.status).toBe(200);
    expect(beforeDeadline.body.carriedOver).toBeGreaterThan(0);
    expect(beforeDeadline.body.forfeited).toBe(0);

    expect(afterDeadline.status).toBe(200);
    expect(afterDeadline.body.carriedOver).toBeGreaterThan(0);
    expect(afterDeadline.body.forfeited).toBe(afterDeadline.body.carriedOver);
  });

  it('AT-05 on-call compliance validates rest window', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/oncall/compliance')
      .query({
        personId: SEED_IDS.personItOncall,
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      })
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(response.status).toBe(200);
    expect(response.body.compliant).toBe(true);

    // Verify non-compliant path: insufficient rest window
    const nonCompliant = await request(app.getHttpServer())
      .get('/v1/oncall/compliance')
      .query({
        personId: SEED_IDS.personItOncall,
        // Next shift immediately after on-call — no rest window
        nextShiftStart: '2026-03-14T06:00:00.000Z',
      })
      .set('Authorization', `Bearer ${TOKENS.hr}`);

    expect(nonCompliant.status).toBe(200);
    expect(nonCompliant.body.compliant).toBe(false);
  });

  it('AT-06 closing export and HR post-close correction', async () => {
    await closePeriodForExport(app);
    await expectClosedPeriodMutationRejected(app);
    const initialExport = await createAndVerifyCsvExport(app);
    await expectIdempotentAndXmlExports(app, initialExport);
    await applyPostCloseCorrection(app);
    await expectExportChangesAfterCorrection(app, initialExport.checksum);
  });

  it('AT-07 team calendar enforces role-based visibility', async () => {
    const requested = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-22',
        note: 'Spring leave',
      });
    expect(requested.status).toBe(201);

    const employeeView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01', end: '2026-04-30' })
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    const leadView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01', end: '2026-04-30' })
      .set('Authorization', `Bearer ${TOKENS.lead}`);

    expect(employeeView.status).toBe(200);
    expect(leadView.status).toBe(200);

    expect(employeeView.body[0]?.visibilityStatus).toBe('ABSENT');
    expect(employeeView.body.every((entry: { type?: string }) => entry.type === undefined)).toBe(
      true,
    );
    expect(
      employeeView.body.every((entry: { status: string }) => entry.status === 'APPROVED'),
    ).toBe(true);
    expect(leadView.body.some((entry: { status: string }) => entry.status === 'REQUESTED')).toBe(
      true,
    );
    expect(leadView.body[0]?.type).toBeDefined();

    // Lead can see absence details that employees cannot
    const leadEntry = leadView.body.find(
      (entry: { personId?: string }) => entry.personId === SEED_IDS.personEmployee,
    );
    if (leadEntry) {
      expect(leadEntry.type).toBeDefined();
    }
  });

  it('AT-08 backup and restore verification', async () => {
    const cwd = join(__dirname, '..', '..', '..', '..');
    const output = execSync('node scripts/backup-restore-verify.mjs --json', {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public',
      },
    }).toString('utf8');

    const report = JSON.parse(output) as {
      ok: boolean;
      source: { tables: Record<string, number> };
    };
    expect(report.ok).toBe(true);
    expect(report.source.tables.auditEntries).toBeGreaterThan(0);
  }, 20_000);
});
