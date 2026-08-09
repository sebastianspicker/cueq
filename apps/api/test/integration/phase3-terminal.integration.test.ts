import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';

describe('Phase 3 integration: terminal', () => {
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

  it('imports Honeywell CSV file batches with malformed-row accounting', async () => {
    const csv = [
      'personId,timeTypeCode,startTime,endTime,note',
      `${SEED_IDS.personPlanner},WORK,2026-03-15T08:00:00.000Z,2026-03-15T16:00:00.000Z,"first, comma"`,
      'invalid-person,WORK,2026-03-15T08:00:00.000Z,2026-03-15T16:00:00.000Z,bad',
      `${SEED_IDS.personPlanner},WORK,2026-03-15T08:00:00.000Z,2026-03-15T16:00:00.000Z,"dup, comma"`,
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
    expect(response.body.rawRows).toBe(3);
    expect(response.body.validRows).toBe(2);
    expect(response.body.created).toBe(1);
    expect(response.body.duplicates).toBe(1);
    expect(response.body.malformedRows).toBe(1);

    const detailAsHr = await request(app.getHttpServer())
      .get(`/v1/terminal/sync/batches/${response.body.batchId}`)
      .set('Authorization', `Bearer ${TOKENS.hr}`);
    expect(detailAsHr.status).toBe(200);
    expect(detailAsHr.body.resultPayload.rawRows).toBe(3);
    expect(detailAsHr.body.resultPayload.validRows).toBe(2);
    expect(detailAsHr.body.resultPayload.malformedRows).toBe(1);

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
});
