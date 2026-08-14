import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { createTerminalEdgeCaseTestSupport } from './terminal-edge-cases-test-support.js';

describe('Terminal gateway edge cases (P6.2)', () => {
  let app: INestApplication;
  const { syncBatch, syncHoneywellCsv } = createTerminalEdgeCaseTestSupport(() => app);

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
