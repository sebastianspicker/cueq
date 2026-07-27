import { describe, expect, it } from 'vitest';
import {
  ClosingBookingCorrectionResponseSchema,
  ClosingExportResponseSchema,
  ClosingPeriodMutationResponseSchema,
  NullableWorkflowPolicySchema,
  OnCallComplianceCheckSchema,
  RosterPublishResponseSchema,
  RosterUnassignResponseSchema,
  WorkflowInstanceSchema,
  WorkflowPolicyHistorySchema,
} from '../index.js';

const IDS = {
  actor: 'c00000000000000000000001',
  entity: 'c00000000000000000000002',
  period: 'c00000000000000000000003',
  roster: 'c00000000000000000000004',
  run: 'c00000000000000000000005',
  timeType: 'c00000000000000000000006',
  workflow: 'c00000000000000000000007',
} as const;

const NOW = '2026-07-16T08:00:00.000Z';

describe('API response schemas', () => {
  it('matches the on-call compliance response produced by the API', () => {
    expect(
      OnCallComplianceCheckSchema.parse({
        personId: IDS.actor,
        rotationId: null,
        restHoursAfterDeployment: 9.5,
        minimumRestHours: 11,
        compliant: false,
        violations: [
          {
            code: 'ONCALL_REST_DEFICIT',
            severity: 'ERROR',
            message: 'Minimum rest period was not met.',
          },
        ],
      }),
    ).toMatchObject({
      minimumRestHours: 11,
      violations: [{ code: 'ONCALL_REST_DEFICIT' }],
    });
  });

  it('distinguishes closing lifecycle, export, and correction responses', () => {
    expect(
      ClosingPeriodMutationResponseSchema.parse({
        id: IDS.period,
        organizationUnitId: null,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-07-31T23:59:59.000Z',
        status: 'APPROVED',
      }),
    ).toMatchObject({ id: IDS.period, status: 'APPROVED' });

    expect(
      ClosingExportResponseSchema.parse({
        exportRun: {
          id: IDS.run,
          closingPeriodId: IDS.period,
          format: 'CSV_V1',
          recordCount: 1,
          checksum: 'sha256',
          artifact: 'personId,targetHours',
          contentType: 'text/csv',
          exportedAt: NOW,
          exportedById: IDS.actor,
        },
        checksum: 'sha256',
        csv: 'personId,targetHours',
        artifact: 'personId,targetHours',
        contentType: 'text/csv',
        rows: [{ personId: IDS.actor, targetHours: 39.83, actualHours: 40, balance: 0.17 }],
      }),
    ).toMatchObject({ checksum: 'sha256' });

    expect(
      ClosingBookingCorrectionResponseSchema.parse({
        id: IDS.entity,
        closingPeriodId: IDS.period,
        workflowId: IDS.workflow,
        personId: IDS.actor,
        timeTypeId: IDS.timeType,
        timeTypeCode: 'WORK',
        timeTypeCategory: 'WORK',
        startTime: '2026-07-16T08:00:00.000Z',
        endTime: '2026-07-16T10:00:00.000Z',
        source: 'CORRECTION',
        note: null,
        durationHours: 2,
      }),
    ).toMatchObject({ workflowId: IDS.workflow, durationHours: 2 });
  });

  it('matches roster publish and unassign mutation responses', () => {
    expect(
      RosterPublishResponseSchema.parse({
        id: IDS.roster,
        status: 'PUBLISHED',
        publishedAt: NOW,
      }),
    ).toMatchObject({ status: 'PUBLISHED' });
    expect(
      RosterUnassignResponseSchema.parse({
        deleted: true,
        assignmentId: IDS.entity,
      }),
    ).toEqual({ deleted: true, assignmentId: IDS.entity });
  });

  it('preserves workflow policy history end dates and accepts a missing active policy', () => {
    expect(NullableWorkflowPolicySchema.parse(null)).toBeNull();
    expect(
      WorkflowPolicyHistorySchema.parse({
        total: 1,
        entries: [
          {
            id: IDS.entity,
            type: 'LEAVE_REQUEST',
            escalationDeadlineHours: 48,
            escalationRoles: ['HR'],
            maxDelegationDepth: 5,
            activeFrom: '2026-01-01T00:00:00.000Z',
            activeTo: NOW,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: NOW,
          },
        ],
      }).entries[0]?.activeTo,
    ).toBe(NOW);
  });

  it('uses a workflow instance, not an inbox projection, for decision mutations', () => {
    expect(
      WorkflowInstanceSchema.parse({
        id: IDS.workflow,
        type: 'LEAVE_REQUEST',
        status: 'APPROVED',
        requesterId: IDS.actor,
        approverId: IDS.actor,
        entityType: 'Absence',
        entityId: IDS.entity,
        reason: null,
        decidedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toMatchObject({ status: 'APPROVED' });
  });
});
