import { describe, expect, it } from 'vitest';
import {
  AbsencePageSchema,
  AbsenceQuerySchema,
  BookingPageSchema,
  BookingCorrectionSchema,
  BookingQuerySchema,
  ClosingPeriodMonthQuerySchema,
  CreateOnCallDeploymentSchema,
  CreateOnCallRotationSchema,
  CreateWorkflowDelegationRuleSchema,
  DateRangeSchema,
  ListOnCallRotationsQuerySchema,
  ShiftSwapRequestSchema,
  TimeRuleEvaluationRequestSchema,
  TimeRuleIntervalSchema,
  UpdateWorkflowDelegationRuleSchema,
  WorkflowDecisionCommandSchema,
  UpdateShiftSchema,
  WorkflowDecisionBodySchema,
  WorkflowInboxQuerySchema,
} from '../index.js';

const IDS = {
  delegator: 'c00000000000000000000001',
  delegate: 'c00000000000000000000002',
  organization: 'c00000000000000000000003',
  person: 'c00000000000000000000004',
  rotation: 'c00000000000000000000005',
} as const;

const EARLIER = '2026-08-01T08:00:00.000Z';
const LATER = '2026-08-01T10:00:00.000Z';
const VALID_CUID = 'c123456789012345678901234';

describe('cross-feature validation behavior', () => {
  it('compares timestamps by instant and rejects reverse booking, deployment, and shift ranges', () => {
    expect(DateRangeSchema.safeParse({ start: LATER, end: EARLIER }).success).toBe(false);
    expect(
      BookingCorrectionSchema.safeParse({
        bookingId: IDS.person,
        startTime: LATER,
        endTime: EARLIER,
        reason: 'Corrected terminal clock time',
      }).success,
    ).toBe(false);
    expect(
      CreateOnCallDeploymentSchema.safeParse({
        rotationId: IDS.rotation,
        personId: IDS.person,
        startTime: LATER,
        endTime: EARLIER,
      }).success,
    ).toBe(false);
    expect(UpdateShiftSchema.safeParse({ startTime: LATER, endTime: EARLIER }).success).toBe(false);
  });

  it('enforces chronological query and month boundaries', () => {
    expect(ListOnCallRotationsQuerySchema.safeParse({ from: LATER, to: EARLIER }).success).toBe(
      false,
    );
    expect(
      ClosingPeriodMonthQuerySchema.safeParse({ from: '2026-09', to: '2026-08' }).success,
    ).toBe(false);
    expect(
      CreateOnCallRotationSchema.safeParse({
        personId: IDS.person,
        organizationUnitId: IDS.organization,
        startTime: LATER,
        endTime: EARLIER,
        rotationType: 'DAILY',
      }).success,
    ).toBe(false);
  });

  it('bounds cursor-based booking and absence pages while rejecting reversed filters', () => {
    expect(
      BookingQuerySchema.parse({
        limit: '2',
        cursor: 'opaque-continuation',
        from: EARLIER,
        to: LATER,
      }),
    ).toMatchObject({ limit: 2, cursor: 'opaque-continuation', from: EARLIER, to: LATER });
    expect(BookingQuerySchema.safeParse({ from: LATER, to: EARLIER }).success).toBe(false);

    expect(
      AbsenceQuerySchema.parse({
        limit: '3',
        cursor: 'opaque-continuation',
        from: '2026-08-01',
        to: '2026-08-31',
        status: 'APPROVED',
      }),
    ).toMatchObject({
      limit: 3,
      cursor: 'opaque-continuation',
      status: 'APPROVED',
    });
    expect(AbsenceQuerySchema.safeParse({ from: '2026-08-31', to: '2026-08-01' }).success).toBe(
      false,
    );

    expect(BookingPageSchema.parse({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(AbsencePageSchema.safeParse({ items: [], nextCursor: undefined }).success).toBe(false);
  });

  it('keeps workflow action and delegation commands internally coherent', () => {
    expect(WorkflowDecisionCommandSchema.safeParse({ workflowId: IDS.rotation }).success).toBe(
      false,
    );
    expect(WorkflowDecisionBodySchema.safeParse({}).success).toBe(false);
    expect(
      WorkflowDecisionBodySchema.safeParse({ action: 'APPROVE', decision: 'APPROVED' }).success,
    ).toBe(false);
    expect(
      UpdateWorkflowDelegationRuleSchema.safeParse({ activeFrom: LATER, activeTo: EARLIER })
        .success,
    ).toBe(false);
    expect(WorkflowDecisionBodySchema.safeParse({ action: 'DELEGATE' }).success).toBe(false);
    expect(
      CreateWorkflowDelegationRuleSchema.safeParse({
        delegatorId: IDS.delegator,
        delegateId: IDS.delegator,
        activeFrom: LATER,
        activeTo: EARLIER,
      }).success,
    ).toBe(false);
    expect(
      ShiftSwapRequestSchema.safeParse({
        shiftId: IDS.rotation,
        fromPersonId: IDS.person,
        toPersonId: IDS.person,
        reason: 'Coverage swap needed for an urgent appointment',
      }).success,
    ).toBe(false);
  });

  it('rejects conflicting workflow decisions and incomplete delegations after ID validation', () => {
    expect(
      WorkflowDecisionCommandSchema.safeParse({
        workflowId: VALID_CUID,
        action: 'APPROVE',
        decision: 'APPROVED',
      }).success,
    ).toBe(false);
    expect(
      WorkflowDecisionCommandSchema.safeParse({ workflowId: VALID_CUID, action: 'DELEGATE' })
        .success,
    ).toBe(false);
    expect(
      WorkflowDecisionCommandSchema.parse({ workflowId: VALID_CUID, action: 'APPROVE' }),
    ).toMatchObject({ action: 'APPROVE' });
  });

  it('normalizes inbox query booleans idempotently across controller and service', () => {
    const once = WorkflowInboxQuerySchema.parse({ overdueOnly: 'true', limit: '20' });
    expect(WorkflowInboxQuerySchema.parse(once)).toEqual(once);
    expect(WorkflowInboxQuerySchema.safeParse({ overdueOnly: 'yes' }).success).toBe(false);
    expect(WorkflowInboxQuerySchema.parse({ overdueOnly: 'true' })).toEqual({
      overdueOnly: true,
      limit: 50,
    });
    expect(WorkflowInboxQuerySchema.parse({ overdueOnly: 'false' })).toEqual({
      overdueOnly: false,
      limit: 50,
    });
  });

  it('rejects invalid IANA time zones before time-rule evaluation', () => {
    expect(
      TimeRuleEvaluationRequestSchema.safeParse({
        week: '2026-W31',
        targetHours: 39.83,
        timezone: 'Europe/Not-A-Place',
        intervals: [],
      }).success,
    ).toBe(false);
  });

  it('rejects reverse time-rule intervals before policy evaluation', () => {
    expect(
      TimeRuleIntervalSchema.safeParse({ start: LATER, end: EARLIER, type: 'WORK' }).success,
    ).toBe(false);
  });
});
