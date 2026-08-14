import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

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
});
