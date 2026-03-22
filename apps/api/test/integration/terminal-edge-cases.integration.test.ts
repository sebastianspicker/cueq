import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';
import { PrismaService } from '../../src/persistence/prisma.service';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';

/**
 * P6.2 terminal gateway edge-case tests:
 *  - Duplicate record handling in JSON batch sync
 *  - Malformed CSV input edge cases
 *  - Terminal offline for extended period then sync
 *  - Concurrent batch submissions
 */
describe('Terminal gateway edge cases (P6.2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /* ── Duplicate Record Handling in JSON Batch Sync ───────────── */

  describe('duplicate record handling in JSON batch sync', () => {
    it('deduplicates identical records within a single batch', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-DEDUP-01',
          sourceFile: 'dedup-batch.csv',
          records: [
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-01T08:00:00.000Z',
              endTime: '2026-04-01T16:00:00.000Z',
            },
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-01T08:00:00.000Z',
              endTime: '2026-04-01T16:00:00.000Z',
            },
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-01T08:00:00.000Z',
              endTime: '2026-04-01T16:00:00.000Z',
            },
          ],
        });

      expect(response.status).toBe(201);
      // Three identical records → 2 duplicates, 1 created
      expect(response.body.duplicates).toBe(2);
      expect(response.body.created).toBe(1);
    });

    it('does not count different records as duplicates', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-DEDUP-02',
          sourceFile: 'dedup-batch-02.csv',
          records: [
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-02T08:00:00.000Z',
              endTime: '2026-04-02T12:00:00.000Z',
            },
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-02T13:00:00.000Z',
              endTime: '2026-04-02T17:00:00.000Z',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.duplicates).toBe(0);
      expect(response.body.created).toBe(2);
    });

    it('handles cross-batch deduplication (second import of same records)', async () => {
      const firstBatch = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-CROSS-DEDUP',
          sourceFile: 'cross-dedup-first.csv',
          records: [
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-03T08:00:00.000Z',
              endTime: '2026-04-03T16:00:00.000Z',
            },
          ],
        });
      expect(firstBatch.status).toBe(201);
      expect(firstBatch.body.created).toBe(1);

      const secondBatch = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-CROSS-DEDUP',
          sourceFile: 'cross-dedup-second.csv',
          records: [
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-04-03T08:00:00.000Z',
              endTime: '2026-04-03T16:00:00.000Z',
            },
          ],
        });
      expect(secondBatch.status).toBe(201);
      // Already imported in first batch → 0 new, 1 duplicate
      expect(secondBatch.body.created).toBe(0);
      expect(secondBatch.body.duplicates).toBe(1);
    });
  });

  /* ── Malformed CSV Input ────────────────────────────────────── */

  describe('malformed CSV input edge cases', () => {
    it('handles CSV with only header row (no data)', async () => {
      const csv = 'personId,timeTypeCode,startTime,endTime,note';

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-EMPTY-CSV',
          sourceFile: 'empty.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv,
        });

      expect(response.status).toBe(201);
      expect(response.body.created).toBe(0);
      expect(response.body.malformedRows).toBe(0);
    });

    it('handles CSV with completely empty body', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-EMPTY-BODY',
          sourceFile: 'empty-body.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv: '',
        });

      // May be 400 (invalid CSV) or 201 (empty but valid) — should not be 500
      expect(response.status).toBeLessThan(500);
    });

    it('handles CSV with missing required columns', async () => {
      const csv = ['personId,note', `${SEED_IDS.personPlanner},missing fields`].join('\n');

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-MISSING-COLS',
          sourceFile: 'missing-cols.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv,
        });

      // Should count rows as malformed, not crash
      expect(response.status).toBeLessThan(500);
      if (response.status === 201) {
        expect(response.body.malformedRows).toBeGreaterThan(0);
      }
    });

    it('handles CSV with invalid date formats', async () => {
      const csv = [
        'personId,timeTypeCode,startTime,endTime,note',
        `${SEED_IDS.personPlanner},WORK,not-a-date,also-not-a-date,invalid dates`,
      ].join('\n');

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-INVALID-DATES',
          sourceFile: 'invalid-dates.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv,
        });

      expect(response.status).toBeLessThan(500);
      if (response.status === 201) {
        expect(response.body.malformedRows).toBeGreaterThan(0);
      }
    });

    it('handles CSV with extra columns gracefully', async () => {
      const csv = [
        'personId,timeTypeCode,startTime,endTime,note,extraCol1,extraCol2',
        `${SEED_IDS.personPlanner},WORK,2026-04-04T08:00:00.000Z,2026-04-04T16:00:00.000Z,extra cols,val1,val2`,
      ].join('\n');

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-EXTRA-COLS',
          sourceFile: 'extra-cols.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv,
        });

      // Extra columns should be ignored, valid row should be created
      expect(response.status).toBe(201);
      expect(response.body.created).toBe(1);
    });

    it('handles CSV with mixed valid and malformed rows', async () => {
      const csv = [
        'personId,timeTypeCode,startTime,endTime,note',
        `${SEED_IDS.personPlanner},WORK,2026-04-05T08:00:00.000Z,2026-04-05T12:00:00.000Z,valid row 1`,
        'invalid-cuid,WORK,not-a-date,also-not-a-date,bad row',
        `${SEED_IDS.personPlanner},WORK,2026-04-05T13:00:00.000Z,2026-04-05T17:00:00.000Z,valid row 2`,
        ',,,,totally empty row',
      ].join('\n');

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-MIXED-CSV',
          sourceFile: 'mixed.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv,
        });

      expect(response.status).toBe(201);
      // At least some rows should be malformed, at least some created
      expect(response.body.malformedRows).toBeGreaterThanOrEqual(1);
      expect(response.body.created).toBeGreaterThanOrEqual(1);
    });
  });

  /* ── Terminal Offline for Extended Period Then Sync ─────────── */

  describe('terminal offline for extended period then sync', () => {
    it('syncs records with old timestamps after terminal reconnection', async () => {
      // Simulate a terminal that was offline for 30 days and buffered records
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-OFFLINE-30D',
          sourceFile: 'offline-backlog.csv',
          records: [
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-02-01T08:00:00.000Z',
              endTime: '2026-02-01T16:00:00.000Z',
            },
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-02-15T08:00:00.000Z',
              endTime: '2026-02-15T16:00:00.000Z',
            },
            {
              personId: SEED_IDS.personPlanner,
              timeTypeCode: 'WORK',
              startTime: '2026-03-01T08:00:00.000Z',
              endTime: '2026-03-01T16:00:00.000Z',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.created).toBeGreaterThan(0);
      expect(response.body.sorted).toBe(true);
    });

    it('reports heartbeat with high buffered record count after offline period', async () => {
      const heartbeat = await request(app.getHttpServer())
        .post('/v1/terminal/heartbeats')
        .set('x-integration-token', TERMINAL_TOKEN)
        .send({
          terminalId: 'T-OFFLINE-RECON',
          observedAt: new Date().toISOString(),
          bufferedRecords: 500,
          errorCount: 3,
        });

      expect(heartbeat.status).toBe(201);
      expect(heartbeat.body.terminalId).toBe('T-OFFLINE-RECON');
      // Heartbeat response includes bufferedRecords and errorCount
      expect(heartbeat.body.bufferedRecords).toBe(500);
      expect(heartbeat.body.errorCount).toBe(3);

      const health = await request(app.getHttpServer())
        .get('/v1/terminal/health')
        .set('x-integration-token', TERMINAL_TOKEN);

      expect(health.status).toBe(200);
      const terminal = health.body.terminals.find(
        (t: { terminalId: string }) => t.terminalId === 'T-OFFLINE-RECON',
      );
      expect(terminal).toBeDefined();
      // Health endpoint exposes lastErrorCount (not bufferedRecords)
      expect(terminal.lastErrorCount).toBe(3);
      expect(terminal.lastSeenAt).toBeTruthy();
    });

    it('handles large batch with many records from offline period', async () => {
      const records = Array.from({ length: 50 }, (_, i) => ({
        personId: SEED_IDS.personPlanner,
        timeTypeCode: 'WORK',
        startTime: `2026-01-${String(Math.min(i + 1, 31)).padStart(2, '0')}T08:00:00.000Z`,
        endTime: `2026-01-${String(Math.min(i + 1, 31)).padStart(2, '0')}T16:00:00.000Z`,
      }));

      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-BULK-SYNC',
          sourceFile: 'bulk-offline.csv',
          records,
        });

      expect(response.status).toBe(201);
      // Many will be unique, some may be duplicates (same day capped at 31)
      expect(response.body.created + response.body.duplicates).toBe(50);
      expect(response.body.sorted).toBe(true);
    });

    it('produces conflict flags when syncing bookings during an approved absence', async () => {
      // The sync endpoint detects ABSENCE_CONFLICT: bookings overlapping
      // with an approved absence for the same person.
      // First, ensure person has an approved absence in the target range.
      const absence = await request(app.getHttpServer())
        .post('/v1/absences')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          personId: SEED_IDS.personEmployee,
          type: 'ANNUAL_LEAVE',
          startDate: '2026-04-10',
          endDate: '2026-04-11',
        });
      expect(absence.status).toBe(201);

      // Approve the absence via the workflow inbox
      const inbox = await request(app.getHttpServer())
        .get('/v1/workflows/inbox')
        .set('Authorization', `Bearer ${TOKENS.lead}`);
      const leaveWf = inbox.body.find((entry: { type: string }) => entry.type === 'LEAVE_REQUEST');
      if (leaveWf) {
        await request(app.getHttpServer())
          .post(`/v1/workflows/${leaveWf.id}/decision`)
          .set('Authorization', `Bearer ${TOKENS.lead}`)
          .send({ decision: 'APPROVED', reason: 'Test' });
      }

      // Now sync a booking that overlaps with the approved absence
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.hr}`)
        .send({
          terminalId: 'T-CONFLICT-01',
          sourceFile: 'conflict-batch.csv',
          records: [
            {
              personId: SEED_IDS.personEmployee,
              timeTypeCode: 'WORK',
              startTime: '2026-04-10T08:00:00.000Z',
              endTime: '2026-04-10T16:00:00.000Z',
            },
          ],
        });

      expect(response.status).toBe(201);
      // Booking overlapping an approved absence produces ABSENCE_CONFLICT
      expect(response.body.conflictFlags.length).toBeGreaterThan(0);
      expect(response.body.conflictFlags[0].type).toBe('ABSENCE_CONFLICT');
    });
  });

  /* ── Access Control Edge Cases ──────────────────────────────── */

  describe('terminal sync access control', () => {
    it('rejects employee access to terminal batch sync', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .send({
          terminalId: 'T-UNAUTH',
          sourceFile: 'unauth.csv',
          records: [],
        });

      expect(response.status).toBe(403);
    });

    it('rejects employee access to terminal file sync', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/terminal/sync/batches/file')
        .set('Authorization', `Bearer ${TOKENS.employee}`)
        .send({
          terminalId: 'T-UNAUTH-FILE',
          sourceFile: 'unauth.csv',
          protocol: 'HONEYWELL_CSV_V1',
          csv: 'personId,timeTypeCode,startTime,endTime,note',
        });

      expect(response.status).toBe(403);
    });
  });
});
