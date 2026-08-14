import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { RosterShiftHelper } from '../roster-shift.helper.js';

const USER = {
  subject: 'actor-1',
  email: 'planner@example.invalid',
  role: Role.SHIFT_PLANNER,
  organizationUnitId: 'org-1',
  claims: {},
};
const ROSTER = {
  id: 'roster-1',
  organizationUnitId: 'org-1',
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-10-31T23:59:59.999Z'),
  status: 'DRAFT',
};
const START = new Date('2026-10-05T08:00:00.000Z');
const END = new Date('2026-10-05T16:00:00.000Z');

function shiftFixture(overrides: object = {}) {
  return {
    id: 'shift-1',
    rosterId: ROSTER.id,
    personId: null,
    startTime: START,
    endTime: END,
    shiftType: 'EARLY',
    minStaffing: 1,
    roster: ROSTER,
    assignments: [],
    ...overrides,
  };
}

function createHelper(database: object, transactionClient: object) {
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const closing = {
    assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
    assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockResolvedValue(undefined),
    rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
      throw error;
    }),
  };
  const helper = new RosterShiftHelper(
    {
      ...database,
      $transaction: vi.fn(async (callback: (tx: object) => unknown) => callback(transactionClient)),
    } as never,
    {
      personForUser: vi.fn().mockResolvedValue({ id: 'actor-1', organizationUnitId: 'org-1' }),
    } as never,
    audit as never,
    closing as never,
  );

  return { helper, audit, closing };
}

function rosterLockClient() {
  return vi.fn().mockResolvedValue([{ acquired: true }]);
}

describe('roster shift mutations', () => {
  it('creates the shift and audit entry atomically after both closing checks', async () => {
    const created = shiftFixture();
    const tx = {
      $queryRaw: rosterLockClient(),
      roster: { findUnique: vi.fn().mockResolvedValue(ROSTER) },
      shift: { create: vi.fn().mockResolvedValue(created) },
    };
    const { helper, audit, closing } = createHelper(
      { roster: { findUnique: vi.fn().mockResolvedValue(ROSTER) } },
      tx,
    );

    await expect(
      helper.createRosterShift(USER, ROSTER.id, {
        startTime: START.toISOString(),
        endTime: END.toISOString(),
        shiftType: 'EARLY',
        minStaffing: 1,
      }),
    ).resolves.toMatchObject({ id: created.id, rosterId: ROSTER.id });

    expect(closing.assertClosingPeriodUnlockedForRange).toHaveBeenCalledWith(
      expect.objectContaining({ from: START, to: END, attemptedAction: 'SHIFT_CREATE' }),
    );
    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      { organizationUnitId: ROSTER.organizationUnitId, from: START, to: END },
      tx,
    );
    expect(tx.shift.create).toHaveBeenCalledTimes(1);
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_CREATED', entityId: created.id }),
      tx,
    );
  });

  it('updates the shift and audit entry inside the roster-write transaction', async () => {
    const initial = shiftFixture();
    const updated = shiftFixture({ minStaffing: 2 });
    const tx = {
      $queryRaw: rosterLockClient(),
      shift: {
        findFirst: vi.fn().mockResolvedValue(initial),
        update: vi.fn().mockResolvedValue(updated),
      },
      shiftAssignment: { findFirst: vi.fn() },
    };
    const { helper, audit, closing } = createHelper(
      { shift: { findFirst: vi.fn().mockResolvedValue(initial) } },
      tx,
    );

    await expect(
      helper.updateRosterShift(USER, ROSTER.id, initial.id, { minStaffing: 2 }),
    ).resolves.toMatchObject({ id: updated.id, minStaffing: 2 });

    expect(closing.assertClosingPeriodUnlockedForRange).toHaveBeenCalledTimes(1);
    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      { organizationUnitId: ROSTER.organizationUnitId, from: START, to: END },
      tx,
    );
    expect(tx.shift.update).toHaveBeenCalledTimes(1);
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_UPDATED', entityId: updated.id }),
      tx,
    );
  });

  it('deletes assignments, the shift, and the audit entry inside the transaction', async () => {
    const initial = shiftFixture({ _count: { bookings: 0 } });
    const current = shiftFixture({ _count: { bookings: 0 } });
    const tx = {
      $queryRaw: rosterLockClient(),
      shift: {
        findFirst: vi.fn().mockResolvedValue(current),
        delete: vi.fn().mockResolvedValue(current),
      },
      shiftAssignment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const { helper, audit, closing } = createHelper(
      { shift: { findFirst: vi.fn().mockResolvedValue(initial) } },
      tx,
    );

    await expect(helper.deleteRosterShift(USER, ROSTER.id, initial.id)).resolves.toEqual({
      deleted: true,
      shiftId: initial.id,
    });

    expect(closing.assertClosingPeriodUnlockedForRange).toHaveBeenCalledWith(
      expect.objectContaining({ from: START, to: END, attemptedAction: 'SHIFT_DELETE' }),
    );
    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      { organizationUnitId: ROSTER.organizationUnitId, from: START, to: END },
      tx,
    );
    expect(tx.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { shiftId: current.id } });
    expect(tx.shift.delete).toHaveBeenCalledWith({ where: { id: current.id } });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_DELETED', entityId: current.id }),
      tx,
    );
  });
});
