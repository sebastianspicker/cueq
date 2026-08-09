import { describe, expect, it, vi } from 'vitest';
import { AbsenceStatus, WorkflowType } from '@cueq/database';
import { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';

describe('WorkflowSideEffectsHelper effects', () => {
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

  it('uses the supplied decision transaction in validation and preserves shift-swap guard order', async () => {
    const calls: string[] = [];
    const tx = {
      workflowInstance: {
        findUnique: vi.fn(async () => {
          calls.push('workflow');
          return {
            id: 'cworkflow00000000000000001',
            type: WorkflowType.SHIFT_SWAP,
            entityType: 'Shift',
            entityId: 'cshift000000000000000001',
            requestPayload: {
              shiftId: 'cshift000000000000000001',
              fromPersonId: 'cfromperson00000000000001',
              toPersonId: 'ctoperson0000000000000001',
              reason: 'Swap the weekend shift.',
            },
          };
        }),
      },
      shift: {
        findUnique: vi.fn(async () => {
          calls.push('shift');
          return {
            assignments: [{ personId: 'cfromperson00000000000001' }],
            roster: { organizationUnitId: 'corg000000000000000000001' },
          };
        }),
      },
      person: {
        findUnique: vi.fn(async () => {
          calls.push('person');
          return {
            id: 'ctoperson0000000000000001',
            organizationUnitId: 'corg000000000000000000001',
          };
        }),
      },
    };
    const helper = new WorkflowSideEffectsHelper({} as never, {} as never);

    await helper.validatePreApproval('cworkflow00000000000000001', tx as never);

    expect(calls).toEqual(['workflow', 'shift', 'person']);
  });

  it('parses shift-swap requests before querying their target', async () => {
    const tx = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cworkflow00000000000000001',
          type: WorkflowType.SHIFT_SWAP,
          entityType: 'Shift',
          entityId: 'cshift000000000000000001',
          requestPayload: {},
        }),
      },
      shift: { findUnique: vi.fn() },
      person: { findUnique: vi.fn() },
    };
    const helper = new WorkflowSideEffectsHelper({} as never, {} as never);

    await expect(
      helper.validatePreApproval('cworkflow00000000000000001', tx as never),
    ).rejects.toThrow();
    expect(tx.shift.findUnique).not.toHaveBeenCalled();
  });

  it('validates overtime account matching through the supplied transaction', async () => {
    const tx = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cworkflow00000000000000001',
          type: WorkflowType.OVERTIME_APPROVAL,
          entityType: 'TimeAccount',
          entityId: 'caccount000000000000001',
          requestPayload: {
            personId: 'cperson000000000000000001',
            periodStart: '2026-03-01T00:00:00.000Z',
            periodEnd: '2026-03-31T23:59:59.999Z',
            overtimeHours: 2,
            reason: 'Approved weekend work.',
          },
        }),
      },
      timeAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'caccount000000000000001' }) },
    };
    const helper = new WorkflowSideEffectsHelper({} as never, {} as never);

    await helper.validatePreApproval('cworkflow00000000000000001', tx as never);

    expect(tx.timeAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'caccount000000000000001',
          personId: 'cperson000000000000000001',
        }),
      }),
    );
  });

  it('updates leave conditionally and audits only a successful status transition in transaction order', async () => {
    const calls: string[] = [];
    const tx = {
      absence: {
        findUnique: vi.fn(async () => {
          calls.push('find');
          return { status: AbsenceStatus.REQUESTED };
        }),
        updateMany: vi.fn(async () => {
          calls.push('update');
          return { count: 1 };
        }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_entry: unknown, db: unknown) => {
        expect(db).toBe(tx);
        calls.push('audit');
      }),
    };
    const helper = new WorkflowSideEffectsHelper({} as never, auditHelper as never);

    await helper.applyDecisionSideEffects(
      'capprover00000000000000001',
      {
        action: 'APPROVE',
        updated: {
          id: 'cworkflow00000000000000001',
          type: WorkflowType.LEAVE_REQUEST,
          entityType: 'Absence',
          entityId: 'cabsence0000000000000001',
        },
      } as never,
      'Approved leave.',
      tx as never,
    );

    expect(calls).toEqual(['find', 'update', 'audit']);
    expect(tx.absence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AbsenceStatus.REQUESTED }),
      }),
    );
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ABSENCE_APPROVED' }),
      tx,
    );

    tx.absence.updateMany.mockResolvedValueOnce({ count: 0 });
    await helper.applyDecisionSideEffects(
      'capprover00000000000000001',
      {
        action: 'REJECT',
        updated: {
          id: 'cworkflow00000000000000002',
          type: WorkflowType.LEAVE_REQUEST,
          entityType: 'Absence',
          entityId: 'cabsence0000000000000002',
        },
      } as never,
      undefined,
      tx as never,
    );
    expect(auditHelper.appendAudit).toHaveBeenCalledTimes(1);
  });

  it('checks the correction target and overlap before mutating and auditing', async () => {
    const calls: string[] = [];
    const booking = {
      id: 'cbooking000000000000000001',
      personId: 'cperson000000000000000001',
      timeTypeId: 'ctime00000000000000000001',
      startTime: new Date('2026-03-02T08:00:00.000Z'),
      endTime: new Date('2026-03-02T12:00:00.000Z'),
    };
    const tx = {
      booking: {
        findUnique: vi.fn(async () => {
          calls.push('target');
          return booking;
        }),
        findFirst: vi.fn(async () => {
          calls.push('overlap');
          return null;
        }),
        update: vi.fn(async () => {
          calls.push('mutation');
          return booking;
        }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_entry: unknown, db: unknown) => {
        expect(db).toBe(tx);
        calls.push('audit');
      }),
    };
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
          requestPayload: { bookingId: booking.id, reason: 'Correct the booking.' },
        },
      } as never,
      undefined,
      tx as never,
    );

    expect(calls).toEqual(['target', 'overlap', 'mutation', 'audit']);
  });

  it('uses the supplied transaction for a shift swap in validation, mutation, and audit order', async () => {
    const calls: string[] = [];
    const tx = {
      shift: {
        findUnique: vi.fn(async () => {
          calls.push('shift');
          return {
            id: 'cshift000000000000000001',
            personId: 'cfromperson00000000000001',
            startTime: new Date('2026-03-02T08:00:00.000Z'),
            endTime: new Date('2026-03-02T12:00:00.000Z'),
            assignments: [
              { id: 'cassignment00000000000001', personId: 'cfromperson00000000000001' },
            ],
            roster: { organizationUnitId: 'corg000000000000000000001' },
          };
        }),
        update: vi.fn(async () => calls.push('primary-person')),
      },
      person: {
        findUnique: vi.fn(async () => {
          calls.push('person');
          return {
            id: 'ctoperson0000000000000001',
            organizationUnitId: 'corg000000000000000000001',
          };
        }),
      },
      shiftAssignment: {
        findFirst: vi.fn(async () => {
          calls.push('overlap');
          return null;
        }),
        delete: vi.fn(async () => calls.push('delete')),
        create: vi.fn(async () => calls.push('create')),
      },
      auditEntry: {},
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_entry: unknown, db: unknown) => {
        expect(db).toBe(tx);
        calls.push('audit');
      }),
    };
    const helper = new WorkflowSideEffectsHelper(
      { $transaction: vi.fn() } as never,
      auditHelper as never,
    );

    await helper.applyDecisionSideEffects(
      'capprover00000000000000001',
      {
        action: 'APPROVE',
        updated: {
          id: 'cworkflow00000000000000001',
          type: WorkflowType.SHIFT_SWAP,
          entityType: 'Shift',
          entityId: 'cshift000000000000000001',
          requestPayload: {
            shiftId: 'cshift000000000000000001',
            fromPersonId: 'cfromperson00000000000001',
            toPersonId: 'ctoperson0000000000000001',
            reason: 'Swap the weekend shift.',
          },
        },
      } as never,
      'Approved shift swap.',
      tx as never,
    );

    expect(calls).toEqual([
      'shift',
      'person',
      'overlap',
      'delete',
      'create',
      'primary-person',
      'audit',
    ]);
  });

  it('opens a transaction only when a shift swap has no caller transaction', async () => {
    const calls: string[] = [];
    const tx = {
      shift: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cshift000000000000000001',
          personId: null,
          startTime: new Date('2026-03-02T08:00:00.000Z'),
          endTime: new Date('2026-03-02T12:00:00.000Z'),
          assignments: [{ id: 'cassignment00000000000001', personId: 'cfromperson00000000000001' }],
          roster: { organizationUnitId: 'corg000000000000000000001' },
        }),
      },
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ctoperson0000000000000001',
          organizationUnitId: 'corg000000000000000000001',
        }),
      },
      shiftAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
      auditEntry: {},
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(async (callback: (database: typeof tx) => Promise<void>) => {
        calls.push('transaction');
        await callback(tx);
      }),
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new WorkflowSideEffectsHelper(prisma as never, auditHelper as never);

    await helper.applyDecisionSideEffects('capprover00000000000000001', {
      action: 'APPROVE',
      updated: {
        id: 'cworkflow00000000000000001',
        type: WorkflowType.SHIFT_SWAP,
        entityType: 'Shift',
        entityId: 'cshift000000000000000001',
        requestPayload: {
          shiftId: 'cshift000000000000000001',
          fromPersonId: 'cfromperson00000000000001',
          toPersonId: 'ctoperson0000000000000001',
          reason: 'Swap the weekend shift.',
        },
      },
    } as never);

    expect(calls).toEqual(['transaction']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('matches, updates, and audits approved overtime in the caller transaction', async () => {
    const calls: string[] = [];
    const account = { id: 'caccount000000000000001', overtimeHours: 1.235 };
    const tx = {
      timeAccount: {
        findFirst: vi.fn(async () => {
          calls.push('match');
          return account;
        }),
        update: vi.fn(async () => {
          calls.push('update');
          return { ...account, overtimeHours: 3.24 };
        }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_entry: unknown, db: unknown) => {
        expect(db).toBe(tx);
        calls.push('audit');
      }),
    };
    const helper = new WorkflowSideEffectsHelper({} as never, auditHelper as never);

    await helper.applyDecisionSideEffects(
      'capprover00000000000000001',
      {
        action: 'APPROVE',
        updated: {
          id: 'cworkflow00000000000000001',
          type: WorkflowType.OVERTIME_APPROVAL,
          entityType: 'TimeAccount',
          entityId: account.id,
          requestPayload: {
            personId: 'cperson000000000000000001',
            periodStart: '2026-03-01T00:00:00.000Z',
            periodEnd: '2026-03-31T23:59:59.999Z',
            overtimeHours: 2,
            reason: 'Approved weekend work.',
          },
        },
      } as never,
      'Approved overtime.',
      tx as never,
    );

    expect(calls).toEqual(['match', 'update', 'audit']);
    expect(tx.timeAccount.update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: { overtimeHours: 3.24 },
    });
  });
});
