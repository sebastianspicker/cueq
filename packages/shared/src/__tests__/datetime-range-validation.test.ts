import { describe, expect, it } from 'vitest';
import { BookingCorrectionSchema, CreateBookingSchema } from '../schemas/booking';
import { ClosingBookingCorrectionSchema } from '../schemas/closing';
import { DateRangeSchema } from '../schemas/common';
import {
  CreateOnCallDeploymentSchema,
  CreateOnCallRotationSchema,
  ListOnCallDeploymentsQuerySchema,
  UpdateOnCallRotationSchema,
} from '../schemas/oncall';
import { CreateRosterSchema, CreateShiftSchema, UpdateShiftSchema } from '../schemas/roster';
import { AuditEntriesQuerySchema } from '../schemas/reporting';
import { TimeRuleIntervalSchema } from '../schemas/time-engine';
import {
  CreateWorkflowDelegationRuleSchema,
  OvertimeApprovalRequestSchema,
  UpdateWorkflowDelegationRuleSchema,
} from '../schemas/workflow';

const earlier = '2026-03-03T07:00:00Z';
const later = '2026-03-03T07:00:00.001Z';
const personId = 'c00000000000000000000001';
const secondaryId = 'c00000000000000000000002';

describe('datetime range validation', () => {
  it('orders variable-precision ISO datetimes by instant rather than text', () => {
    expect(DateRangeSchema.safeParse({ start: earlier, end: later }).success).toBe(true);
    expect(DateRangeSchema.safeParse({ start: later, end: earlier }).success).toBe(false);
  });

  it('uses instant ordering for booking and closing corrections', () => {
    expect(
      CreateBookingSchema.safeParse({
        personId,
        timeTypeId: secondaryId,
        startTime: earlier,
        endTime: later,
        source: 'WEB',
      }).success,
    ).toBe(true);
    expect(
      CreateBookingSchema.safeParse({
        personId,
        timeTypeId: secondaryId,
        startTime: later,
        endTime: earlier,
        source: 'WEB',
      }).success,
    ).toBe(false);
    expect(
      BookingCorrectionSchema.safeParse({
        bookingId: personId,
        startTime: later,
        endTime: earlier,
        reason: 'Corrected timestamp',
      }).success,
    ).toBe(false);
    expect(
      ClosingBookingCorrectionSchema.safeParse({
        workflowId: personId,
        personId,
        timeTypeId: secondaryId,
        startTime: later,
        endTime: earlier,
        reason: 'Closing correction reason',
      }).success,
    ).toBe(false);
  });

  it('uses instant ordering for on-call and roster ranges', () => {
    expect(
      CreateOnCallRotationSchema.safeParse({
        personId,
        organizationUnitId: secondaryId,
        startTime: earlier,
        endTime: later,
        rotationType: 'CUSTOM',
      }).success,
    ).toBe(true);
    expect(
      CreateOnCallDeploymentSchema.safeParse({
        rotationId: personId,
        personId,
        startTime: later,
        endTime: earlier,
      }).success,
    ).toBe(false);
    expect(
      UpdateOnCallRotationSchema.safeParse({ startTime: later, endTime: earlier }).success,
    ).toBe(false);
    expect(ListOnCallDeploymentsQuerySchema.safeParse({ from: later, to: earlier }).success).toBe(
      false,
    );
    expect(
      CreateRosterSchema.safeParse({
        organizationUnitId: personId,
        periodStart: earlier,
        periodEnd: later,
      }).success,
    ).toBe(true);
    expect(
      CreateShiftSchema.safeParse({
        startTime: later,
        endTime: earlier,
        shiftType: 'DAY',
        minStaffing: 1,
      }).success,
    ).toBe(false);
    expect(UpdateShiftSchema.safeParse({ startTime: later, endTime: earlier }).success).toBe(false);
  });

  it('uses instant ordering for time-engine and workflow ranges', () => {
    expect(
      TimeRuleIntervalSchema.safeParse({ start: earlier, end: later, type: 'WORK' }).success,
    ).toBe(true);
    expect(
      TimeRuleIntervalSchema.safeParse({ start: later, end: earlier, type: 'WORK' }).success,
    ).toBe(false);
    expect(
      CreateWorkflowDelegationRuleSchema.safeParse({
        delegatorId: personId,
        delegateId: secondaryId,
        activeFrom: later,
        activeTo: earlier,
      }).success,
    ).toBe(false);
    expect(
      UpdateWorkflowDelegationRuleSchema.safeParse({ activeFrom: later, activeTo: earlier })
        .success,
    ).toBe(false);
    expect(
      OvertimeApprovalRequestSchema.safeParse({
        personId,
        periodStart: later,
        periodEnd: earlier,
        overtimeHours: 1,
        reason: 'Overtime approval reason',
      }).success,
    ).toBe(false);
  });

  it('uses instant ordering for optional audit-entry filters', () => {
    expect(AuditEntriesQuerySchema.safeParse({ from: earlier, to: later }).success).toBe(true);
    expect(AuditEntriesQuerySchema.safeParse({ from: later, to: earlier }).success).toBe(false);
  });
});
