import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';
import { SEED_IDS } from '../../src/test-utils/seed-ids';

describe('Phase 2 compliance', () => {
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

  it('denies employee access to HR-only closing approval', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/closing-periods/${SEED_IDS.closingPeriod}/approve`)
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send();

    expect(response.status).toBe(403);
  });

  it('redacts absence reason for employee team-calendar view', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    expect(response.status).toBe(200);
    expect(response.body[0]?.type).toBeUndefined();
    expect(response.body[0]?.note).toBeUndefined();
  });
});
