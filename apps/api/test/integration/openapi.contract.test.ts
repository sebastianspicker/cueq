import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers';
import { buildOpenApiDocument } from '../../src/openapi';

describe('Phase 2 integration: OpenAPI contract', () => {
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

  it('contains all required /v1 phase-2 paths', () => {
    const document = buildOpenApiDocument(app);
    const paths = Object.keys(document.paths ?? {});

    const required = [
      '/v1/me',
      '/v1/dashboard/me',
      '/v1/bookings/me',
      '/v1/bookings',
      '/v1/absences',
      '/v1/absences/me',
      '/v1/leave-balance/me',
      '/v1/calendar/team',
      '/v1/workflows/booking-corrections',
      '/v1/workflows/inbox',
      '/v1/workflows/{id}/decision',
      '/v1/rosters/current',
      '/v1/rosters/{id}/plan-vs-actual',
      '/v1/oncall/deployments',
      '/v1/oncall/compliance',
      '/v1/closing-periods/{id}/checklist',
      '/v1/closing-periods/{id}/approve',
      '/v1/closing-periods/{id}/export',
      '/v1/closing-periods/{id}/post-close-corrections',
      '/v1/terminal/sync/batches',
      '/v1/terminal/sync/batches/{id}',
    ];

    for (const path of required) {
      expect(paths).toContain(path);
    }
  });
});
