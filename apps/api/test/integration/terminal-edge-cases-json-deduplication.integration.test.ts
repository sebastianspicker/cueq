import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { createTerminalEdgeCaseTestSupport } from './terminal-edge-cases-test-support.js';

describe('Terminal gateway edge cases (P6.2)', () => {
  let app: INestApplication;
  const { as, syncBatch, workRecord } = createTerminalEdgeCaseTestSupport(() => app);

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
});
