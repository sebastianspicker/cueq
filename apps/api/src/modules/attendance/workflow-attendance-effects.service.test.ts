import { BadRequestException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowEffectInput } from '../../application/ports/workflow-side-effects.port.js';
import { WorkflowAttendanceEffectsService } from './workflow-attendance-effects.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  booking: 'c00000000000000000000002',
  person: 'c00000000000000000000003',
  timeType: 'c00000000000000000000004',
  workflow: 'c00000000000000000000005',
  account: 'c00000000000000000000006',
};
const startTime = new Date('2026-08-20T08:00:00.000Z');
const endTime = new Date('2026-08-20T12:00:00.000Z');

function input(tx: object, decision: WorkflowEffectInput['decision']): WorkflowEffectInput {
  return {
    actorId: ids.actor,
    action: 'APPROVE',
    decision,
    reason: 'The requested correction has been checked.',
    tx: tx as WorkflowEffectInput['tx'],
  };
}

describe('WorkflowAttendanceEffectsService', () => {
  it('applies an approved booking correction through its supplied transaction', async () => {
    const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const booking = {
      id: ids.booking,
      personId: ids.person,
      timeTypeId: ids.timeType,
      startTime,
      endTime,
    };
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi
          .fn()
          .mockResolvedValue({ ...booking, endTime: new Date('2026-08-20T13:00:00.000Z') }),
      },
    };
    const service = new WorkflowAttendanceEffectsService(audit as never);

    await service.applyWorkflowEffect(
      input(tx, {
        id: ids.workflow,
        type: WorkflowType.BOOKING_CORRECTION,
        entityType: 'Booking',
        entityId: ids.booking,
        requestPayload: {
          bookingId: ids.booking,
          endTime: '2026-08-20T13:00:00.000Z',
          reason: 'Forgot to record the final hour.',
        },
      }),
    );

    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: ids.booking },
      data: {
        startTime,
        endTime: new Date('2026-08-20T13:00:00.000Z'),
        timeTypeId: ids.timeType,
      },
    });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_UPDATED', entityId: ids.booking }),
      tx,
    );
  });

  it('rejects a booking-correction payload that targets a different booking before mutation', async () => {
    const audit = { appendAudit: vi.fn() };
    const tx = { booking: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() } };
    const service = new WorkflowAttendanceEffectsService(audit as never);

    await expect(
      service.applyWorkflowEffect(
        input(tx, {
          id: ids.workflow,
          type: WorkflowType.BOOKING_CORRECTION,
          entityType: 'Booking',
          entityId: ids.booking,
          requestPayload: {
            bookingId: ids.account,
            reason: 'This correction belongs to another item.',
          },
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tx.booking.findUnique).not.toHaveBeenCalled();
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('updates the matching time account for an approved overtime workflow', async () => {
    const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      timeAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: ids.account, overtimeHours: 1.25 }),
        update: vi.fn().mockResolvedValue({ id: ids.account, overtimeHours: 3.5 }),
      },
    };
    const service = new WorkflowAttendanceEffectsService(audit as never);

    await service.applyWorkflowEffect(
      input(tx, {
        id: ids.workflow,
        type: WorkflowType.OVERTIME_APPROVAL,
        entityType: 'TimeAccount',
        entityId: ids.account,
        requestPayload: {
          personId: ids.person,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-08-31T23:59:59.000Z',
          overtimeHours: 2.25,
          reason: 'Approved overtime for the August closing period.',
        },
      }),
    );

    expect(tx.timeAccount.update).toHaveBeenCalledWith({
      where: { id: ids.account },
      data: { overtimeHours: 3.5 },
    });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OVERTIME_APPROVED', entityId: ids.account }),
      tx,
    );
  });
});
