import { describe, expect, it, vi } from 'vitest';
import { Role } from '@cueq/database';
import { RosterAssignmentHelper } from '../roster-assignment.helper';

describe('roster write lock ordering', () => {
  it('locks closing periods, the roster, and the affected person before overlap validation', async () => {
    const events: string[] = [];
    const personId = 'c000000000000000000000001';
    const startTime = new Date('2026-10-05T08:00:00.000Z');
    const endTime = new Date('2026-10-05T16:00:00.000Z');
    const shift = {
      id: 'shift-1',
      personId: null,
      startTime,
      endTime,
      roster: { organizationUnitId: 'org-1', status: 'DRAFT' },
    };
    const assignment = {
      id: 'assignment-1',
      shiftId: shift.id,
      personId,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn(async (_query, key: string) => {
        events.push(key);
        return [{ acquired: true }];
      }),
      shift: { findFirst: vi.fn().mockResolvedValue(shift), update: vi.fn() },
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: personId,
          firstName: 'Ada',
          lastName: 'Lovelace',
          organizationUnitId: 'org-1',
        }),
      },
      shiftAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(assignment),
      },
    };
    const prisma = {
      shift: { findFirst: vi.fn().mockResolvedValue(shift) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const shiftHelper = {
      assertCanWriteRoster: vi.fn(),
      assertRosterIsDraft: vi.fn(),
      ensureNoOverlappingAssignedShift: vi.fn(async () => {
        events.push('overlap-validation');
      }),
    };
    const helper = new RosterAssignmentHelper(
      prisma as never,
      {
        personForUser: vi.fn().mockResolvedValue({ id: 'actor-1', organizationUnitId: 'org-1' }),
      } as never,
      { appendAudit: vi.fn() } as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn(),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(async () => {
          events.push('closing-period-guard');
        }),
        rethrowWithDurableClosingAudit: vi.fn(),
      } as never,
      shiftHelper as never,
    );

    await helper.assignRosterShift(
      {
        subject: 'actor-1',
        email: 'planner@example.invalid',
        role: Role.SHIFT_PLANNER,
        organizationUnitId: 'org-1',
        claims: {},
      },
      'roster-1',
      shift.id,
      { personId },
    );

    expect(events).toEqual([
      'closing-period-guard',
      'cueq:roster-write:roster-1',
      `cueq:person-write:${personId}`,
      'overlap-validation',
    ]);
  });
});
