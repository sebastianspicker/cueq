import { BadGatewayException } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';
import { Phase2Service } from '../../src/phase2/phase2.service';
import { PrismaService } from '../../src/persistence/prisma.service';
import type { HrMasterProviderPort } from '../../src/phase2/hr-master-provider.port';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';
const HR_IMPORT_TOKEN = process.env.HR_IMPORT_TOKEN ?? 'dev-hr-token';

describe('Phase 3 integration: terminal, HR import, payroll csv', () => {
  let app: INestApplication;
  let hrProviderMode: 'success' | 'invalid-payload' = 'success';

  const hrProvider: HrMasterProviderPort = {
    async fetchMasterRecords() {
      if (hrProviderMode === 'invalid-payload') {
        throw new BadGatewayException('HR master API returned an invalid payload schema.');
      }

      return [
        {
          externalId: 'hrapi100',
          firstName: 'Api',
          lastName: 'Import',
          email: 'api.import@cueq.local',
          role: 'EMPLOYEE',
          organizationUnit: 'Verwaltung',
          workTimeModel: 'Gleitzeit Vollzeit',
          weeklyHours: '39.83',
          dailyTargetHours: '7.97',
          supervisorExternalId: 'lead01',
        },
      ];
    },
  };

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp({ hrMasterProvider: hrProvider });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts terminal heartbeat and exposes terminal health', async () => {
    const heartbeat = await request(app.getHttpServer())
      .post('/v1/terminal/heartbeats')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send({
        terminalId: 'T-NEW-01',
        observedAt: '2026-03-12T09:00:00.000Z',
        bufferedRecords: 2,
        errorCount: 0,
      });

    expect(heartbeat.status).toBe(201);
    expect(heartbeat.body.terminalId).toBe('T-NEW-01');

    const health = await request(app.getHttpServer())
      .get('/v1/terminal/health')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send();

    expect(health.status).toBe(200);
    expect(Array.isArray(health.body.terminals)).toBe(true);
    expect(
      health.body.terminals.find((t: { terminalId: string }) => t.terminalId === 'T-NEW-01'),
    ).toBeDefined();
  });

  it('imports Honeywell CSV file batches with malformed-row accounting', async () => {
    const csv = [
      'personId,timeTypeCode,startTime,endTime,note',
      `${SEED_IDS.personPlanner},WORK,2026-03-11T08:00:00.000Z,2026-03-11T16:00:00.000Z,"first, comma"`,
      'invalid-person,WORK,2026-03-11T08:00:00.000Z,2026-03-11T16:00:00.000Z,bad',
      `${SEED_IDS.personPlanner},WORK,2026-03-11T08:00:00.000Z,2026-03-11T16:00:00.000Z,"dup, comma"`,
    ].join('\n');

    const response = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches/file')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-HONEYWELL-01',
        sourceFile: 'honeywell-batch-01.csv',
        protocol: 'HONEYWELL_CSV_V1',
        csv,
      });

    expect(response.status).toBe(201);
    expect(response.body.protocol).toBe('HONEYWELL_CSV_V1');
    expect(response.body.created).toBe(1);
    expect(response.body.duplicates).toBe(1);
    expect(response.body.malformedRows).toBe(1);

    const detailAsHr = await request(app.getHttpServer())
      .get(`/v1/terminal/sync/batches/${response.body.batchId}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(detailAsHr.status).toBe(200);

    const detailAsEmployee = await request(app.getHttpServer())
      .get(`/v1/terminal/sync/batches/${response.body.batchId}`)
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    expect(detailAsEmployee.status).toBe(403);
  });

  it('keeps terminal file imports idempotent across repeated batches', async () => {
    const csv = [
      'personId,timeTypeCode,startTime,endTime,note',
      `${SEED_IDS.personPlanner},WORK,2026-03-13T08:00:00.000Z,2026-03-13T16:00:00.000Z,first`,
    ].join('\n');

    const first = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches/file')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-HONEYWELL-IDEMPOTENT',
        sourceFile: 'honeywell-batch-idempotent.csv',
        protocol: 'HONEYWELL_CSV_V1',
        csv,
      });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(1);

    const second = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches/file')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-HONEYWELL-IDEMPOTENT',
        sourceFile: 'honeywell-batch-idempotent.csv',
        protocol: 'HONEYWELL_CSV_V1',
        csv,
      });
    expect(second.status).toBe(201);
    expect(second.body.created).toBe(0);
    expect(second.body.duplicates).toBe(1);

    const prisma = app.get(PrismaService);
    const importedBookings = await prisma.booking.count({
      where: {
        personId: SEED_IDS.personPlanner,
        source: 'IMPORT',
        startTime: new Date('2026-03-13T08:00:00.000Z'),
      },
    });
    expect(importedBookings).toBe(1);
  });

  it('rejects oversized terminal CSV payloads', async () => {
    const oversizedCsv = 'x'.repeat(2_000_001);
    const response = await request(app.getHttpServer())
      .post('/v1/terminal/sync/batches/file')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        terminalId: 'T-HONEYWELL-OVERSIZE',
        sourceFile: 'oversized.csv',
        protocol: 'HONEYWELL_CSV_V1',
        csv: oversizedCsv,
      });

    expect(response.status).toBe(413);
  });

  it('runs file-based HR import and fetches import run', async () => {
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
      'hrimp100,Ina,Import,ina.import@cueq.local,EMPLOYEE,"Verwaltung, Campus Nord",Gleitzeit Vollzeit,39.83,7.97,lead01',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-phase3.csv',
        csv,
      });

    expect(run.status).toBe(201);
    expect(run.body.status).toBe('SUCCEEDED');
    expect(run.body.totalRows).toBe(1);

    const prisma = app.get(PrismaService);
    const importedPerson = await prisma.person.findFirst({
      where: { externalId: 'hrimp100' },
      include: { organizationUnit: true },
    });
    expect(importedPerson?.organizationUnit?.name).toBe('Verwaltung, Campus Nord');

    const getRun = await request(app.getHttpServer())
      .get(`/v1/hr/import-runs/${run.body.id}`)
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send();

    expect(getRun.status).toBe(200);
    expect(getRun.body.id).toBe(run.body.id);
  });

  it('rejects oversized HR import CSV payloads', async () => {
    const oversizedCsv = 'x'.repeat(2_000_001);

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'oversized-hr.csv',
        csv: oversizedCsv,
      });

    expect(run.status).toBe(413);
  });

  it('runs API-source HR import via provider contract', async () => {
    hrProviderMode = 'success';
    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        source: 'API',
        sourceFile: 'hr-master-http-v1',
      });

    expect(run.status).toBe(201);
    expect(run.body.status).toBe('SUCCEEDED');
    expect(run.body.totalRows).toBe(1);
    expect(run.body.createdRows).toBe(1);
  });

  it('fails API-source import when upstream payload is invalid', async () => {
    hrProviderMode = 'invalid-payload';
    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        source: 'API',
      });

    expect(run.status).toBe(502);
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

    const service = app.get(Phase2Service);
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

  it('supports draft roster lifecycle, assignments, publish gate and plan-vs-actual metrics', async () => {
    const createRoster = await request(app.getHttpServer())
      .post('/v1/rosters')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        organizationUnitId: SEED_IDS.ouSecurity,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.000Z',
      });

    expect(createRoster.status).toBe(201);

    const rosterId = createRoster.body.id as string;
    const detail = await request(app.getHttpServer())
      .get(`/v1/rosters/${rosterId}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.members)).toBe(true);

    const shift = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-04-05T08:00:00.000Z',
        endTime: '2026-04-05T16:00:00.000Z',
        shiftType: 'EARLY',
        minStaffing: 2,
      });
    expect(shift.status).toBe(201);

    const updatedShift = await request(app.getHttpServer())
      .patch(`/v1/rosters/${rosterId}/shifts/${shift.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        shiftType: 'DAY',
      });
    expect(updatedShift.status).toBe(200);
    expect(updatedShift.body.shiftType).toBe('DAY');

    const shiftToDelete = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        startTime: '2026-04-06T08:00:00.000Z',
        endTime: '2026-04-06T16:00:00.000Z',
        shiftType: 'EARLY',
        minStaffing: 1,
      });
    expect(shiftToDelete.status).toBe(201);

    const deletedShift = await request(app.getHttpServer())
      .delete(`/v1/rosters/${rosterId}/shifts/${shiftToDelete.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(deletedShift.status).toBe(200);
    expect(deletedShift.body.deleted).toBe(true);

    const assign = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(assign.status).toBe(201);

    const unassign = await request(app.getHttpServer())
      .delete(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments/${assign.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(unassign.status).toBe(200);
    expect(unassign.body.deleted).toBe(true);

    const reassign = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/shifts/${shift.body.id}/assignments`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
      });
    expect(reassign.status).toBe(201);

    const publishBlocked = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/publish`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(publishBlocked.status).toBe(400);
    const shortfalls =
      publishBlocked.body.shortfalls ?? publishBlocked.body.message?.shortfalls ?? [];
    expect(Array.isArray(shortfalls)).toBe(true);
    expect(shortfalls[0]?.shortfall).toBe(1);

    const reduceMinStaffing = await request(app.getHttpServer())
      .patch(`/v1/rosters/${rosterId}/shifts/${shift.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        minStaffing: 1,
      });
    expect(reduceMinStaffing.status).toBe(200);

    const overlapBooking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personPlanner,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-04-05T08:15:00.000Z',
        endTime: '2026-04-05T15:45:00.000Z',
        source: 'WEB',
        shiftId: shift.body.id,
      });
    expect(overlapBooking.status).toBe(201);

    const publish = await request(app.getHttpServer())
      .post(`/v1/rosters/${rosterId}/publish`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe('PUBLISHED');

    const planVsActual = await request(app.getHttpServer())
      .get(`/v1/rosters/${rosterId}/plan-vs-actual`)
      .set('Authorization', `Bearer ${TOKENS.planner}`);
    expect(planVsActual.status).toBe(200);
    expect(planVsActual.body.totalSlots).toBe(1);
    expect(planVsActual.body.mismatchedSlots).toBe(0);
    expect(planVsActual.body.understaffedSlots).toBe(0);
    expect(planVsActual.body.coverageRate).toBe(1);
    expect(planVsActual.body.slots[0].plannedHeadcount).toBe(1);
    expect(planVsActual.body.slots[0].actualHeadcount).toBe(1);
  });

  it('creates and updates on-call rotations and enforces rotation-bound deployment', async () => {
    const createRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-03-16T00:00:00.000Z',
        endTime: '2026-03-22T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });

    expect(createRotation.status).toBe(201);

    const listRotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ personId: SEED_IDS.personItOncall });

    expect(listRotations.status).toBe(200);
    expect(listRotations.body.length).toBeGreaterThan(0);

    const updateRotation = await request(app.getHttpServer())
      .patch(`/v1/oncall/rotations/${createRotation.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        note: 'Updated for integration test',
      });

    expect(updateRotation.status).toBe(200);
    expect(updateRotation.body.note).toBe('Updated for integration test');

    const createDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-20T01:30:00.000Z',
        endTime: '2026-03-20T02:00:00.000Z',
        remote: true,
      });

    expect(createDeployment.status).toBe(201);

    const listDeploymentsHr = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ personId: SEED_IDS.personItOncall });
    expect(listDeploymentsHr.status).toBe(200);
    expect(listDeploymentsHr.body.length).toBeGreaterThan(0);

    const listDeploymentsEmployee = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.employee}`);
    expect(listDeploymentsEmployee.status).toBe(200);
    expect(Array.isArray(listDeploymentsEmployee.body)).toBe(true);

    const duplicateDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-20T01:30:00.000Z',
        endTime: '2026-03-20T02:00:00.000Z',
        remote: true,
      });
    expect(duplicateDeployment.status).toBe(409);
  });

  it('rejects booking intervals where endTime is before startTime', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personEmployee,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-03-20T16:00:00.000Z',
        endTime: '2026-03-20T08:00:00.000Z',
        source: 'WEB',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('endTime must be after startTime');
  });

  it('rejects integration-reserved booking sources on authenticated booking endpoint', async () => {
    for (const source of ['IMPORT', 'TERMINAL']) {
      const response = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: SEED_IDS.personEmployee,
          timeTypeId: SEED_IDS.timeTypeWork,
          startTime: '2026-03-20T08:00:00.000Z',
          endTime: '2026-03-20T16:00:00.000Z',
          source,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'Booking source IMPORT/TERMINAL is reserved for integration ingestion paths.',
      );
    }
  });

  it('includes overlapping on-call rotations and deployments when filtering by from/to', async () => {
    const rotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-09-01T00:00:00.000Z',
        endTime: '2026-09-30T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(rotation.status).toBe(201);

    const deployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: rotation.body.id,
        startTime: '2026-09-10T01:00:00.000Z',
        endTime: '2026-09-10T03:00:00.000Z',
        remote: true,
      });
    expect(deployment.status).toBe(201);

    const rotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-15T00:00:00.000Z',
        to: '2026-09-15T23:59:59.000Z',
      });
    expect(rotations.status).toBe(200);
    expect(rotations.body.some((entry: { id: string }) => entry.id === rotation.body.id)).toBe(
      true,
    );

    const deployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-10T02:00:00.000Z',
        to: '2026-09-10T02:30:00.000Z',
      });
    expect(deployments.status).toBe(200);
    expect(deployments.body.some((entry: { id: string }) => entry.id === deployment.body.id)).toBe(
      true,
    );
  });

  it('rejects on-call list queries where from is after to', async () => {
    const rotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-10T00:00:00.000Z',
      });
    expect(rotations.status).toBe(400);
    expect(String(rotations.body.message)).toContain('from must be on or before to');

    const deployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-10T00:00:00.000Z',
      });
    expect(deployments.status).toBe(400);
    expect(String(deployments.body.message)).toContain('from must be on or before to');
  });

  it('enforces organization-unit scope for shift planner on on-call endpoints', async () => {
    const itRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-04-06T00:00:00.000Z',
        endTime: '2026-04-12T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(itRotation.status).toBe(201);

    const crossOuCreate = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-04-13T00:00:00.000Z',
        endTime: '2026-04-19T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(crossOuCreate.status).toBe(403);

    const crossOuUpdate = await request(app.getHttpServer())
      .patch(`/v1/oncall/rotations/${itRotation.body.id}`)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send({
        note: 'planner cross-ou edit should fail',
      });
    expect(crossOuUpdate.status).toBe(403);

    const listRotations = await request(app.getHttpServer())
      .get('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .query({ organizationUnitId: SEED_IDS.ouIt });
    expect(listRotations.status).toBe(200);
    expect(
      listRotations.body.some((entry: { id: string }) => entry.id === itRotation.body.id),
    ).toBe(false);

    const itDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: itRotation.body.id,
        startTime: '2026-04-10T01:00:00.000Z',
        endTime: '2026-04-10T01:30:00.000Z',
        remote: true,
      });
    expect(itDeployment.status).toBe(201);

    const listDeployments = await request(app.getHttpServer())
      .get('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .query({ personId: SEED_IDS.personItOncall });
    expect(listDeployments.status).toBe(200);
    expect(
      listDeployments.body.some((entry: { id: string }) => entry.id === itDeployment.body.id),
    ).toBe(false);
  });

  it('rejects on-call rotation with person/organization-unit mismatch', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouAdmin,
        startTime: '2026-03-23T00:00:00.000Z',
        endTime: '2026-03-29T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('organizationUnitId must match');
  });

  it('rejects on-call deployment with end time before start time', async () => {
    const createRotation = await request(app.getHttpServer())
      .post('/v1/oncall/rotations')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        organizationUnitId: SEED_IDS.ouIt,
        startTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-04-05T23:59:59.000Z',
        rotationType: 'WEEKLY',
      });
    expect(createRotation.status).toBe(201);

    const createDeployment = await request(app.getHttpServer())
      .post('/v1/oncall/deployments')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personItOncall,
        rotationId: createRotation.body.id,
        startTime: '2026-03-31T10:00:00.000Z',
        endTime: '2026-03-31T09:00:00.000Z',
        remote: true,
      });

    expect(createDeployment.status).toBe(400);
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
    expect(complianceSummary.body.privacy.minGroupSize).toBeGreaterThan(0);
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

  it('registers webhook endpoints and exposes outbox + delivery states', async () => {
    const createEndpoint = await request(app.getHttpServer())
      .post('/v1/integrations/webhooks/endpoints')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        name: 'integration-test',
        url: 'http://127.0.0.1:9/cueq-webhook',
        subscribedEvents: ['booking.created'],
      });
    expect(createEndpoint.status).toBe(201);

    const createBooking = await request(app.getHttpServer())
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({
        personId: SEED_IDS.personEmployee,
        timeTypeId: SEED_IDS.timeTypeWork,
        startTime: '2026-03-04T08:00:00.000Z',
        endTime: '2026-03-04T16:00:00.000Z',
        source: 'WEB',
      });
    expect(createBooking.status).toBe(201);

    const outboxBefore = await request(app.getHttpServer())
      .get('/v1/integrations/events/outbox')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .query({ status: 'PENDING' });
    expect(outboxBefore.status).toBe(200);
    expect(
      outboxBefore.body.some(
        (event: { eventType: string }) => event.eventType === 'booking.created',
      ),
    ).toBe(true);

    const dispatch = await request(app.getHttpServer())
      .post('/v1/integrations/webhooks/dispatch')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send();
    expect(dispatch.status).toBe(201);

    const deliveries = await request(app.getHttpServer())
      .get('/v1/integrations/webhooks/deliveries')
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.length).toBeGreaterThan(0);
  });

  it('rejects webhook endpoints targeting private addresses when explicitly disabled', async () => {
    const previous = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
    process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'false';

    try {
      const createEndpoint = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          name: 'integration-test-private-block',
          url: 'http://127.0.0.1:9/cueq-webhook',
          subscribedEvents: ['booking.created'],
        });

      expect(createEndpoint.status).toBe(400);
      expect(createEndpoint.body.message).toContain(
        'Webhook url must not target localhost or private network addresses.',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
      } else {
        process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = previous;
      }
    }
  });

  it('rejects dispatch to existing private endpoint when private targets are disabled', async () => {
    const previous = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;

    try {
      process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';
      const createEndpoint = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/endpoints')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          name: 'integration-test-private-existing',
          url: 'http://127.0.0.1:9/cueq-webhook',
          subscribedEvents: ['booking.created'],
        });
      expect(createEndpoint.status).toBe(201);

      const createBooking = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: SEED_IDS.personEmployee,
          timeTypeId: SEED_IDS.timeTypeWork,
          startTime: '2026-03-05T08:00:00.000Z',
          endTime: '2026-03-05T16:00:00.000Z',
          source: 'WEB',
        });
      expect(createBooking.status).toBe(201);

      process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'false';

      const dispatch = await request(app.getHttpServer())
        .post('/v1/integrations/webhooks/dispatch')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send();
      expect(dispatch.status).toBe(201);
      expect(dispatch.body.failed).toBeGreaterThan(0);

      const deliveries = await request(app.getHttpServer())
        .get('/v1/integrations/webhooks/deliveries')
        .set('Authorization', `Bearer ${TOKENS.hr}`);
      expect(deliveries.status).toBe(200);
      expect(
        deliveries.body.some((entry: { error?: string }) =>
          String(entry.error ?? '').includes('Webhook url must not target localhost'),
        ),
      ).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS;
      } else {
        process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = previous;
      }
    }
  });
});
