import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';
const HR_IMPORT_TOKEN = process.env.HR_IMPORT_TOKEN ?? 'dev-hr-token';

describe('Phase 3 integration: terminal, HR import, payroll csv', () => {
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

  it('runs file-based HR import and fetches import run', async () => {
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
      'hrimp100,Ina,Import,ina.import@cueq.local,EMPLOYEE,Verwaltung,Gleitzeit Vollzeit,39.83,7.97,lead01',
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

    const getRun = await request(app.getHttpServer())
      .get(`/v1/hr/import-runs/${run.body.id}`)
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send();

    expect(getRun.status).toBe(200);
    expect(getRun.body.id).toBe(run.body.id);
  });

  it('exports canonical payroll CSV and allows csv download', async () => {
    const resolveCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/c000000000000000000000600/decision')
      .set('Authorization', `Bearer ${TOKENS.hr}`)
      .send({ decision: 'APPROVED', reason: 'Resolved before close' });
    expect(resolveCorrection.status).toBe(201);

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
  });
});
