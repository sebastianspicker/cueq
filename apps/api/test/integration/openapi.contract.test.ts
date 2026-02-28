import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers';
import { buildOpenApiDocument } from '../../src/openapi';

describe('Phase 3 integration: OpenAPI contract', () => {
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

  it('contains all required /v1 phase-3 paths', () => {
    const document = buildOpenApiDocument(app);
    const paths = Object.keys(document.paths ?? {});

    const required = [
      '/v1/me',
      '/v1/policies',
      '/v1/policies/history',
      '/v1/time-engine/evaluate',
      '/v1/dashboard/me',
      '/v1/bookings/me',
      '/v1/bookings',
      '/v1/absences',
      '/v1/absences/me',
      '/v1/absences/{id}/cancel',
      '/v1/leave-balance/me',
      '/v1/leave-adjustments',
      '/v1/calendar/team',
      '/v1/workflows/booking-corrections',
      '/v1/workflows/inbox',
      '/v1/workflows/{id}',
      '/v1/workflows/{id}/decision',
      '/v1/workflows/policies',
      '/v1/workflows/policies/{type}',
      '/v1/workflows/delegations',
      '/v1/workflows/delegations/{id}',
      '/v1/rosters',
      '/v1/rosters/current',
      '/v1/rosters/{id}',
      '/v1/rosters/{id}/shifts',
      '/v1/rosters/{id}/shifts/{shiftId}',
      '/v1/rosters/{id}/shifts/{shiftId}/assignments',
      '/v1/rosters/{id}/shifts/{shiftId}/assignments/{assignmentId}',
      '/v1/rosters/{id}/publish',
      '/v1/rosters/{id}/plan-vs-actual',
      '/v1/oncall/rotations',
      '/v1/oncall/rotations/{id}',
      '/v1/oncall/deployments',
      '/v1/oncall/compliance',
      '/v1/closing-periods',
      '/v1/closing-periods/{id}',
      '/v1/closing-periods/{id}/start-review',
      '/v1/closing-periods/{id}/checklist',
      '/v1/closing-periods/{id}/approve',
      '/v1/closing-periods/{id}/export',
      '/v1/closing-periods/{id}/post-close-corrections',
      '/v1/closing-periods/{id}/reopen',
      '/v1/closing-periods/{closingPeriodId}/export-runs/{runId}/csv',
      '/v1/reports/team-absence',
      '/v1/reports/oe-overtime',
      '/v1/reports/closing-completion',
      '/v1/integrations/webhooks/endpoints',
      '/v1/integrations/events/outbox',
      '/v1/integrations/webhooks/dispatch',
      '/v1/integrations/webhooks/deliveries',
      '/v1/terminal/sync/batches',
      '/v1/terminal/sync/batches/{id}',
      '/v1/terminal/heartbeats',
      '/v1/terminal/health',
      '/v1/hr/import-runs',
      '/v1/hr/import-runs/{id}',
    ];

    for (const path of required) {
      expect(paths).toContain(path);
    }
  });
});
