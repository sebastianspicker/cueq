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

  it('AT-07 team calendar enforces role-based visibility', async () => {
    const requested = await request(app.getHttpServer())
      .post('/v1/absences')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-04-20',
        endDate: '2026-04-22',
        note: 'Spring leave',
      });
    expect(requested.status).toBe(201);

    const employeeView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01', end: '2026-04-30' })
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    const leadView = await request(app.getHttpServer())
      .get('/v1/calendar/team')
      .query({ start: '2026-04-01', end: '2026-04-30' })
      .set('Authorization', `Bearer ${TOKENS.lead}`);

    expect(employeeView.status).toBe(200);
    expect(leadView.status).toBe(200);

    expect(employeeView.body[0]?.visibilityStatus).toBe('ABSENT');
    expect(employeeView.body.every((entry: { type?: string }) => entry.type === undefined)).toBe(
      true,
    );
    expect(
      employeeView.body.every((entry: { status: string }) => entry.status === 'APPROVED'),
    ).toBe(true);
    expect(leadView.body.some((entry: { status: string }) => entry.status === 'REQUESTED')).toBe(
      true,
    );
    expect(leadView.body[0]?.type).toBeDefined();

    // Lead can see absence details that employees cannot
    const leadEntry = leadView.body.find(
      (entry: { personId?: string }) => entry.personId === SEED_IDS.personEmployee,
    );
    if (leadEntry) {
      expect(leadEntry.type).toBeDefined();
    }
  });
});
