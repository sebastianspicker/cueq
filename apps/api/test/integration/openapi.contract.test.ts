import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { buildOpenApiDocument } from '../../src/openapi.js';

type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;

function parameterNames(document: OpenApiDocument, path: string): Set<string> {
  const parameters = document.paths?.[path]?.get?.parameters ?? [];
  return new Set(
    parameters.flatMap((parameter) => {
      if ('$ref' in parameter || !parameter.name) {
        return [];
      }
      return [parameter.name];
    }),
  );
}

function expectQueryParameters(
  document: OpenApiDocument,
  path: string,
  expectedNames: string[],
): void {
  const actualNames = parameterNames(document, path);
  for (const name of expectedNames) {
    expect(actualNames).toContain(name);
  }
}

function expectClosingExportContract(document: OpenApiDocument): void {
  const exportPost = document.paths?.['/v1/closing-periods/{id}/export']?.post;
  const createdResponse = exportPost?.responses?.['201'];
  const createdContent =
    createdResponse && !('$ref' in createdResponse)
      ? createdResponse.content?.['application/json']
      : undefined;
  expect(createdContent).toBeDefined();
  expect(exportPost?.requestBody).toBeDefined();
}

function expectIntegrationTokenSecurity(document: OpenApiDocument): void {
  expect(document.components?.securitySchemes?.['integration-token']).toMatchObject({
    type: 'apiKey',
    in: 'header',
    name: 'x-integration-token',
  });

  const operations = [
    document.paths?.['/v1/terminal/heartbeats']?.post,
    document.paths?.['/v1/terminal/health']?.get,
    document.paths?.['/v1/hr/import-runs']?.post,
    document.paths?.['/v1/hr/import-runs/{id}']?.get,
  ];

  for (const operation of operations) {
    expect(operation?.security).toContainEqual({ 'integration-token': [] });
  }
}

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
      '/v1/workflows/shift-swaps',
      '/v1/workflows/overtime-approvals',
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
      '/v1/closing-periods/{id}/lead-approve',
      '/v1/closing-periods/{id}/checklist',
      '/v1/closing-periods/{id}/approve',
      '/v1/closing-periods/{id}/export',
      '/v1/closing-periods/{id}/post-close-corrections',
      '/v1/closing-periods/{id}/corrections/bookings',
      '/v1/closing-periods/{id}/reopen',
      '/v1/closing-periods/{closingPeriodId}/export-runs/{runId}/csv',
      '/v1/closing-periods/{closingPeriodId}/export-runs/{runId}/artifact',
      '/v1/reports/team-absence',
      '/v1/reports/oe-overtime',
      '/v1/reports/closing-completion',
      '/v1/reports/audit-summary',
      '/v1/reports/compliance-summary',
      '/v1/reports/custom/options',
      '/v1/reports/custom/preview',
      '/v1/integrations/webhooks/endpoints',
      '/v1/integrations/events/outbox',
      '/v1/integrations/webhooks/dispatch',
      '/v1/integrations/webhooks/deliveries',
      '/v1/terminal/sync/batches',
      '/v1/terminal/sync/batches/{id}',
      '/v1/terminal/sync/batches/file',
      '/v1/terminal/heartbeats',
      '/v1/terminal/health',
      '/v1/hr/import-runs',
      '/v1/hr/import-runs/{id}',
    ];

    for (const path of required) {
      expect(paths).toContain(path);
    }
  });

  it('exposes FR-700 query parameters and response schemas', () => {
    const document = buildOpenApiDocument(app);
    expectQueryParameters(document, '/v1/reports/team-absence', [
      'from',
      'to',
      'organizationUnitId',
    ]);
    expectQueryParameters(document, '/v1/reports/oe-overtime', [
      'from',
      'to',
      'organizationUnitId',
    ]);
    expectQueryParameters(document, '/v1/reports/audit-summary', ['from', 'to']);
    expectQueryParameters(document, '/v1/reports/compliance-summary', ['from', 'to']);
    expectClosingExportContract(document);
  });

  it('documents machine endpoint integration-token authentication', () => {
    expectIntegrationTokenSecurity(buildOpenApiDocument(app));
  });
});
