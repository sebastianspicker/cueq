import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

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

  interface TerminalRecord {
    personId: string;
    timeTypeCode: string;
    startTime: string;
    endTime: string;
  }

  interface TerminalBatchPayload {
    terminalId: string;
    sourceFile: string;
    records: TerminalRecord[];
  }

  function as(token: string) {
    const server = app.getHttpServer();

    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${token}`),
    };
  }

  function syncBatch(payload: TerminalBatchPayload, token = TOKENS.hr) {
    return as(token).post('/v1/terminal/sync/batches').send(payload);
  }

  function workRecord(startTime: string, endTime: string, personId = SEED_IDS.personPlanner) {
    return {
      personId,
      timeTypeCode: 'WORK',
      startTime,
      endTime,
    };
  }

  function syncHoneywellCsv(params: {
    terminalId: string;
    sourceFile: string;
    csv: string;
    token?: string;
  }) {
    return as(params.token ?? TOKENS.hr)
      .post('/v1/terminal/sync/batches/file')
      .send({
        terminalId: params.terminalId,
        sourceFile: params.sourceFile,
        protocol: 'HONEYWELL_CSV_V1',
        csv: params.csv,
      });
  }

  function postHeartbeat(payload: {
    terminalId: string;
    observedAt: string;
    bufferedRecords: number;
    errorCount: number;
  }) {
    return request(app.getHttpServer())
      .post('/v1/terminal/heartbeats')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send(payload);
  }

  function getTerminalHealth() {
    return request(app.getHttpServer())
      .get('/v1/terminal/health')
      .set('x-integration-token', TERMINAL_TOKEN);
  }

  async function approveFirstLeaveRequest() {
    const inbox = await as(TOKENS.lead).get('/v1/workflows/inbox');
    const leaveWorkflow = inbox.body.find(
      (entry: { type: string }) => entry.type === 'LEAVE_REQUEST',
    );
    if (leaveWorkflow) {
      await as(TOKENS.lead)
        .post(`/v1/workflows/${leaveWorkflow.id}/decision`)
        .send({ decision: 'APPROVED', reason: 'Test' });
    }
  }

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
      const response = await syncBatch({
        terminalId: 'T-DEDUP-01',
        sourceFile: 'dedup-batch.csv',
        records: [
          workRecord('2026-04-01T08:00:00.000Z', '2026-04-01T16:00:00.000Z'),
          workRecord('2026-04-01T08:00:00.000Z', '2026-04-01T16:00:00.000Z'),
          workRecord('2026-04-01T08:00:00.000Z', '2026-04-01T16:00:00.000Z'),
        ],
      });

      expect(response.status).toBe(201);
      // Three identical records → 2 duplicates, 1 created
      expect(response.body.duplicates).toBe(2);
      expect(response.body.created).toBe(1);
    });

    it('does not count different records as duplicates', async () => {
      const response = await syncBatch({
        terminalId: 'T-DEDUP-02',
        sourceFile: 'dedup-batch-02.csv',
        records: [
          workRecord('2026-04-02T08:00:00.000Z', '2026-04-02T12:00:00.000Z'),
          workRecord('2026-04-02T13:00:00.000Z', '2026-04-02T17:00:00.000Z'),
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.duplicates).toBe(0);
      expect(response.body.created).toBe(2);
    });

    it('handles cross-batch deduplication (second import of same records)', async () => {
      const firstBatch = await syncBatch({
        terminalId: 'T-CROSS-DEDUP',
        sourceFile: 'cross-dedup-first.csv',
        records: [workRecord('2026-04-03T08:00:00.000Z', '2026-04-03T16:00:00.000Z')],
      });
      expect(firstBatch.status).toBe(201);
      expect(firstBatch.body.created).toBe(1);

      const secondBatch = await syncBatch({
        terminalId: 'T-CROSS-DEDUP',
        sourceFile: 'cross-dedup-second.csv',
        records: [workRecord('2026-04-03T08:00:00.000Z', '2026-04-03T16:00:00.000Z')],
      });
      expect(secondBatch.status).toBe(201);
      // Already imported in first batch → 0 new, 1 duplicate
      expect(secondBatch.body.created).toBe(0);
      expect(secondBatch.body.duplicates).toBe(1);
    });

    it('reports unknown time type codes instead of silently dropping records', async () => {
      const response = await syncBatch({
        terminalId: 'T-UNKNOWN-TIME-TYPE',
        sourceFile: 'unknown-time-type.csv',
        records: [
          {
            personId: SEED_IDS.personPlanner,
            timeTypeCode: 'UNKNOWN_TIME_TYPE',
            startTime: '2026-04-06T08:00:00.000Z',
            endTime: '2026-04-06T16:00:00.000Z',
          },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.totalRecords).toBe(1);
      expect(response.body.created).toBe(0);
      expect(response.body.duplicates).toBe(0);
      expect(response.body.conflictFlags).toEqual([]);
      expect(response.body.unknownTimeTypes).toEqual([
        {
          personId: SEED_IDS.personPlanner,
          startTime: '2026-04-06T08:00:00.000Z',
          timeTypeCode: 'UNKNOWN_TIME_TYPE',
        },
      ]);

      const detail = await as(TOKENS.hr).get(`/v1/terminal/sync/batches/${response.body.batchId}`);

      expect(detail.status).toBe(200);
      expect(detail.body.resultPayload.unknownTimeTypes).toEqual(response.body.unknownTimeTypes);
    });
  });

  /* ── Malformed CSV Input ────────────────────────────────────── */

  describe('malformed CSV input edge cases', () => {
    it('handles CSV with only header row (no data)', async () => {
      const csv = 'personId,timeTypeCode,startTime,endTime,note';

      const response = await syncHoneywellCsv({
        terminalId: 'T-EMPTY-CSV',
        sourceFile: 'empty.csv',
        csv,
      });

      expect(response.status).toBe(201);
      expect(response.body.rawRows).toBe(0);
      expect(response.body.validRows).toBe(0);
      expect(response.body.created).toBe(0);
      expect(response.body.malformedRows).toBe(0);
    });

    it('handles CSV with completely empty body', async () => {
      const response = await syncHoneywellCsv({
        terminalId: 'T-EMPTY-BODY',
        sourceFile: 'empty-body.csv',
        csv: '',
      });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toContain('String must contain at least 1 character');
    });

    it('handles CSV with missing required columns', async () => {
      const csv = ['personId,note', `${SEED_IDS.personPlanner},missing fields`].join('\n');

      const response = await syncHoneywellCsv({
        terminalId: 'T-MISSING-COLS',
        sourceFile: 'missing-cols.csv',
        csv,
      });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
      expect(response.body.message).toBe('Missing required Honeywell CSV column: timeTypeCode');
    });

    it('handles CSV with invalid date formats', async () => {
      const csv = [
        'personId,timeTypeCode,startTime,endTime,note',
        `${SEED_IDS.personPlanner},WORK,not-a-date,also-not-a-date,invalid dates`,
      ].join('\n');

      const response = await syncHoneywellCsv({
        terminalId: 'T-INVALID-DATES',
        sourceFile: 'invalid-dates.csv',
        csv,
      });

      expect(response.status).toBe(201);
      expect(response.body.rawRows).toBe(1);
      expect(response.body.validRows).toBe(0);
      expect(response.body.malformedRows).toBe(1);
      expect(response.body.totalRecords).toBe(0);
      expect(response.body.created).toBe(0);
    });

    it('handles CSV with extra columns gracefully', async () => {
      const csv = [
        'personId,timeTypeCode,startTime,endTime,note,extraCol1,extraCol2',
        `${SEED_IDS.personPlanner},WORK,2026-04-04T08:00:00.000Z,2026-04-04T16:00:00.000Z,extra cols,val1,val2`,
      ].join('\n');

      const response = await syncHoneywellCsv({
        terminalId: 'T-EXTRA-COLS',
        sourceFile: 'extra-cols.csv',
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

      const response = await syncHoneywellCsv({
        terminalId: 'T-MIXED-CSV',
        sourceFile: 'mixed.csv',
        csv,
      });

      expect(response.status).toBe(201);
      expect(response.body.rawRows).toBe(4);
      expect(response.body.validRows).toBe(2);
      expect(response.body.malformedRows).toBe(2);
      expect(response.body.totalRecords).toBe(2);
      expect(response.body.created).toBe(2);
    });
  });

  /* ── Terminal Offline for Extended Period Then Sync ─────────── */

  describe('terminal offline for extended period then sync', () => {
    it('syncs records with old timestamps after terminal reconnection', async () => {
      // Simulate a terminal that was offline for 30 days and buffered records
      const response = await syncBatch({
        terminalId: 'T-OFFLINE-30D',
        sourceFile: 'offline-backlog.csv',
        records: [
          workRecord('2026-02-01T08:00:00.000Z', '2026-02-01T16:00:00.000Z'),
          workRecord('2026-02-15T08:00:00.000Z', '2026-02-15T16:00:00.000Z'),
          workRecord('2026-03-01T08:00:00.000Z', '2026-03-01T16:00:00.000Z'),
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.created).toBeGreaterThan(0);
      expect(response.body.sorted).toBe(true);
    });

    it('reports heartbeat with high buffered record count after offline period', async () => {
      const heartbeat = await postHeartbeat({
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

      const health = await getTerminalHealth();

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
        ...workRecord(
          `2026-01-${String(Math.min(i + 1, 31)).padStart(2, '0')}T08:00:00.000Z`,
          `2026-01-${String(Math.min(i + 1, 31)).padStart(2, '0')}T16:00:00.000Z`,
        ),
      }));

      const response = await syncBatch({
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
      const absence = await as(TOKENS.hr).post('/v1/absences').send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-24',
        endDate: '2026-04-25',
      });
      expect(absence.status).toBe(201);

      // Approve the absence via the workflow inbox
      await approveFirstLeaveRequest();

      // Now sync a booking that overlaps with the approved absence
      const response = await syncBatch({
        terminalId: 'T-CONFLICT-01',
        sourceFile: 'conflict-batch.csv',
        records: [
          workRecord(
            '2026-04-24T08:00:00.000Z',
            '2026-04-24T16:00:00.000Z',
            SEED_IDS.personEmployee,
          ),
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
      const response = await syncBatch(
        {
          terminalId: 'T-UNAUTH',
          sourceFile: 'unauth.csv',
          records: [],
        },
        TOKENS.employee,
      );

      expect(response.status).toBe(403);
    });

    it('rejects employee access to terminal file sync', async () => {
      const response = await syncHoneywellCsv({
        terminalId: 'T-UNAUTH-FILE',
        sourceFile: 'unauth.csv',
        csv: 'personId,timeTypeCode,startTime,endTime,note',
        token: TOKENS.employee,
      });

      expect(response.status).toBe(403);
    });
  });
});
