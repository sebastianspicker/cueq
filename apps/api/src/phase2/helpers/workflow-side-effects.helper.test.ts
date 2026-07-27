import { describe, expect, it, vi } from 'vitest';
import { WorkflowType } from '@cueq/database';
import { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';

describe('WorkflowSideEffectsHelper booking correction', () => {
  it('updates the approved correction target and appends an auditable before/after effect', async () => {
    const booking = {
      id: 'cbooking000000000000000001',
      personId: 'cperson000000000000000001',
      timeTypeId: 'ctime00000000000000000001',
      startTime: new Date('2026-03-02T08:00:00.000Z'),
      endTime: new Date('2026-03-02T12:00:00.000Z'),
    };
    const updated = {
      ...booking,
      timeTypeId: 'ctime00000000000000000002',
      startTime: new Date('2026-03-02T08:30:00.000Z'),
      endTime: new Date('2026-03-02T12:30:00.000Z'),
    };
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(booking),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new WorkflowSideEffectsHelper({} as never, auditHelper as never);

    await helper.applyDecisionSideEffects(
      'capprover00000000000000001',
      {
        action: 'APPROVE',
        updated: {
          id: 'cworkflow00000000000000001',
          type: WorkflowType.BOOKING_CORRECTION,
          entityType: 'Booking',
          entityId: booking.id,
          requestPayload: {
            bookingId: booking.id,
            startTime: '2026-03-02T08:30:00.000Z',
            endTime: '2026-03-02T12:30:00.000Z',
            timeTypeId: updated.timeTypeId,
            reason: 'Approved correction to terminal booking.',
          },
        },
      } as never,
      'Approved correction after review.',
      tx as never,
    );

    expect(tx.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ id: { not: booking.id } }]),
        }),
      }),
    );
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: booking.id },
      data: {
        timeTypeId: updated.timeTypeId,
        startTime: updated.startTime,
        endTime: updated.endTime,
      },
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BOOKING_UPDATED',
        entityType: 'Booking',
        entityId: booking.id,
        before: {
          timeTypeId: booking.timeTypeId,
          startTime: '2026-03-02T08:00:00.000Z',
          endTime: '2026-03-02T12:00:00.000Z',
        },
        after: {
          timeTypeId: updated.timeTypeId,
          startTime: '2026-03-02T08:30:00.000Z',
          endTime: '2026-03-02T12:30:00.000Z',
          workflowId: 'cworkflow00000000000000001',
        },
      }),
      tx,
    );
  });
});
