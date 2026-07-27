import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { RosterAssignmentHelper } from '../roster-assignment.helper.js';
import { RosterShiftHelper } from '../roster-shift.helper.js';

const USER = {
  subject: 'actor-1',
  email: 'planner@example.invalid',
  role: Role.SHIFT_PLANNER,
  organizationUnitId: 'org-1',
  claims: {},
};
const PERSON_ID = 'c000000000000000000000001';
const OLD_START = new Date('2026-10-05T08:00:00.000Z');
const OLD_END = new Date('2026-10-05T16:00:00.000Z');
const CURRENT_START = new Date('2026-10-06T08:00:00.000Z');
const CURRENT_END = new Date('2026-10-06T16:00:00.000Z');
const ROSTER = {
  id: 'roster-1',
  organizationUnitId: 'org-1',
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-10-31T23:59:59.999Z'),
  status: 'DRAFT',
};

function closingLockHelper() {
  return {
    assertClosingPeriodUnlockedForRange: vi.fn(),
    assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(),
    rethrowWithDurableClosingAudit: vi.fn(async (error: unknown) => {
      throw error;
    }),
  };
}

function transaction(callbackClient: object) {
  return vi.fn(async (callback: (tx: object) => unknown) => callback(callbackClient));
}

function rosterWriteLock() {
  return vi.fn().mockResolvedValue([{ acquired: true }]);
}

function shiftFixture(overrides: object = {}) {
  return {
    id: 'shift-1',
    rosterId: ROSTER.id,
    personId: null,
    startTime: OLD_START,
    endTime: OLD_END,
    shiftType: 'EARLY',
    minStaffing: 1,
    roster: ROSTER,
    assignments: [],
    ...overrides,
  };
}

function draftShiftFixture(overrides: object = {}) {
  return shiftFixture({
    roster: { organizationUnitId: 'org-1', status: 'DRAFT' },
    ...overrides,
  });
}

function assignmentFixture(overrides: object = {}) {
  return {
    id: 'assignment-1',
    shiftId: 'shift-1',
    personId: PERSON_ID,
    shift: {
      ...draftShiftFixture({ id: 'shift-1', personId: PERSON_ID }),
    },
    ...overrides,
  };
}

function actorDirectory() {
  return {
    personForUser: vi.fn().mockResolvedValue({ id: 'actor-1', organizationUnitId: 'org-1' }),
  };
}

function createRosterShiftHelper(initial: object, tx: object, closing: object) {
  return new RosterShiftHelper(
    {
      shift: { findFirst: vi.fn().mockResolvedValue(initial) },
      $transaction: transaction(tx),
    } as never,
    actorDirectory() as never,
    { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
    closing as never,
  );
}

function createRosterAssignmentHelper(database: object, tx: object, closing: object) {
  return new RosterAssignmentHelper(
    {
      ...database,
      $transaction: transaction(tx),
    } as never,
    actorDirectory() as never,
    { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
    closing as never,
    {
      assertCanWriteRoster: vi.fn(),
      assertRosterIsDraft: vi.fn(),
      ensureNoOverlappingAssignedShift: vi.fn(),
    } as never,
  );
}

function driftedShiftState(initial = shiftFixture()) {
  return {
    initial,
    current: { ...initial, startTime: CURRENT_START, endTime: CURRENT_END },
    queryRaw: rosterWriteLock(),
  };
}

function shiftUpdateDriftHarness() {
  const { initial, current, queryRaw } = driftedShiftState();
  const tx = {
    $queryRaw: queryRaw,
    shift: { findFirst: vi.fn().mockResolvedValue(current), update: vi.fn() },
    shiftAssignment: { findFirst: vi.fn() },
  };
  const closing = closingLockHelper();

  return {
    initial,
    queryRaw,
    tx,
    closing,
    helper: createRosterShiftHelper(initial, tx, closing),
  };
}

function expectRosterLockOnly(queryRaw: ReturnType<typeof vi.fn>) {
  expect(queryRaw).toHaveBeenCalledTimes(1);
  expect(queryRaw.mock.calls[0]?.[1]).toBe('cueq:roster-write:roster-1');
}

describe('roster closing guard drift', () => {
  it('guards the persisted source and requested destination when moving a shift', async () => {
    const destinationStart = new Date('2026-10-20T08:00:00.000Z');
    const destinationEnd = new Date('2026-10-20T16:00:00.000Z');
    const initial = shiftFixture();
    const changed = {
      ...initial,
      startTime: destinationStart,
      endTime: destinationEnd,
    };
    const queryRaw = rosterWriteLock();
    const tx = {
      $queryRaw: queryRaw,
      shift: {
        findFirst: vi.fn().mockResolvedValue(initial),
        update: vi.fn().mockResolvedValue(changed),
      },
      shiftAssignment: { findFirst: vi.fn() },
    };
    const closing = closingLockHelper();
    const helper = createRosterShiftHelper(initial, tx, closing);

    await helper.updateRosterShift(USER, ROSTER.id, initial.id, {
      startTime: destinationStart.toISOString(),
      endTime: destinationEnd.toISOString(),
    });

    const expectedRanges = [
      { organizationUnitId: 'org-1', from: OLD_START, to: OLD_END },
      { organizationUnitId: 'org-1', from: destinationStart, to: destinationEnd },
    ];
    expect(closing.assertClosingPeriodUnlockedForRange.mock.calls).toEqual([
      [expect.objectContaining(expectedRanges[0])],
      [expect.objectContaining(expectedRanges[1])],
    ]);
    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction.mock.calls).toEqual(
      expectedRanges.map((range) => [range, tx]),
    );
    expect(tx.shift.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a shift update when an earlier roster writer changed an inherited guard range', async () => {
    const { initial, queryRaw, tx, closing, helper } = shiftUpdateDriftHarness();

    await expect(
      helper.updateRosterShift(USER, ROSTER.id, initial.id, { minStaffing: 2 }),
    ).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_CHANGED', retryable: true },
    });

    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      { organizationUnitId: 'org-1', from: OLD_START, to: OLD_END },
      tx,
    );
    expectRosterLockOnly(queryRaw);
    expect(tx.shift.update).not.toHaveBeenCalled();
  });

  it('rejects an explicit move when an earlier roster writer changed the guarded source range', async () => {
    const destinationStart = new Date('2026-10-20T08:00:00.000Z');
    const destinationEnd = new Date('2026-10-20T16:00:00.000Z');
    const { initial, queryRaw, tx, closing, helper } = shiftUpdateDriftHarness();

    await expect(
      helper.updateRosterShift(USER, ROSTER.id, initial.id, {
        startTime: destinationStart.toISOString(),
        endTime: destinationEnd.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_CHANGED', retryable: true },
    });

    expect(closing.assertClosingPeriodUnlockedForRangeInTransaction.mock.calls).toEqual([
      [{ organizationUnitId: 'org-1', from: OLD_START, to: OLD_END }, tx],
      [{ organizationUnitId: 'org-1', from: destinationStart, to: destinationEnd }, tx],
    ]);
    expectRosterLockOnly(queryRaw);
    expect(tx.shift.update).not.toHaveBeenCalled();
  });

  it('rejects a shift deletion when the shift range changed before the roster lock', async () => {
    const initial = draftShiftFixture({ _count: { bookings: 0 } });
    const current = {
      ...initial,
      startTime: CURRENT_START,
      endTime: CURRENT_END,
      assignments: [],
    };
    const queryRaw = rosterWriteLock();
    const tx = {
      $queryRaw: queryRaw,
      shift: { findFirst: vi.fn().mockResolvedValue(current), delete: vi.fn() },
      shiftAssignment: { deleteMany: vi.fn() },
    };
    const helper = createRosterShiftHelper(initial, tx, closingLockHelper());

    await expect(helper.deleteRosterShift(USER, ROSTER.id, initial.id)).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_CHANGED', retryable: true },
    });

    expectRosterLockOnly(queryRaw);
    expect(tx.shiftAssignment.deleteMany).not.toHaveBeenCalled();
    expect(tx.shift.delete).not.toHaveBeenCalled();
  });

  it('rejects assignment before taking the person lock when the guarded shift range drifted', async () => {
    const { initial, current, queryRaw } = driftedShiftState(draftShiftFixture());
    const tx = {
      $queryRaw: queryRaw,
      shift: { findFirst: vi.fn().mockResolvedValue(current), update: vi.fn() },
      person: { findUnique: vi.fn() },
      shiftAssignment: { findFirst: vi.fn(), create: vi.fn() },
    };
    const helper = createRosterAssignmentHelper(
      { shift: { findFirst: vi.fn().mockResolvedValue(initial) } },
      tx,
      closingLockHelper(),
    );

    await expect(
      helper.assignRosterShift(USER, ROSTER.id, initial.id, { personId: PERSON_ID }),
    ).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_CHANGED', retryable: true },
    });

    expectRosterLockOnly(queryRaw);
    expect(tx.person.findUnique).not.toHaveBeenCalled();
    expect(tx.shiftAssignment.create).not.toHaveBeenCalled();
  });

  it('rejects unassignment before mutation when the assignment shift range drifted', async () => {
    const initial = assignmentFixture();
    const current = {
      ...initial,
      shift: {
        ...initial.shift,
        startTime: CURRENT_START,
        endTime: CURRENT_END,
        assignments: [{ personId: PERSON_ID }],
      },
    };
    const queryRaw = rosterWriteLock();
    const tx = {
      $queryRaw: queryRaw,
      shift: { update: vi.fn() },
      shiftAssignment: {
        findFirst: vi.fn().mockResolvedValue(current),
        delete: vi.fn(),
      },
    };
    const helper = createRosterAssignmentHelper(
      { shiftAssignment: { findFirst: vi.fn().mockResolvedValue(initial) } },
      tx,
      closingLockHelper(),
    );

    await expect(
      helper.unassignRosterShift(USER, ROSTER.id, initial.shift.id, initial.id),
    ).rejects.toMatchObject({
      response: { code: 'ROSTER_SHIFT_CHANGED', retryable: true },
    });

    expectRosterLockOnly(queryRaw);
    expect(tx.shiftAssignment.delete).not.toHaveBeenCalled();
    expect(tx.shift.update).not.toHaveBeenCalled();
  });
});
