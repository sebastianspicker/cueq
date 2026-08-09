import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { createTerminalEdgeCaseTestSupport } from './terminal-edge-cases-test-support.js';

describe('Terminal gateway edge cases (P6.2)', () => {
  let app: INestApplication;
  const { as, syncBatch, workRecord, postHeartbeat, getTerminalHealth, approveFirstLeaveRequest } =
    createTerminalEdgeCaseTestSupport(() => app);

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
});
