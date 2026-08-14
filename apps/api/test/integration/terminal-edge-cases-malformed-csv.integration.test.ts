import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { createTerminalEdgeCaseTestSupport } from './terminal-edge-cases-test-support.js';

describe('Terminal gateway edge cases (P6.2)', () => {
  let app: INestApplication;
  const { syncHoneywellCsv } = createTerminalEdgeCaseTestSupport(() => app);

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
});
