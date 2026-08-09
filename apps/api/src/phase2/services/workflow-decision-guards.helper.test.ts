import { describe, expect, it, vi } from 'vitest';
import { WorkflowType } from '@cueq/database';
import { prepareDecisionGuards } from './workflow-decision-guards.helper.js';

const ids = {
  workflow: 'clwflow000000000000000001',
  shift: 'clshift0000000000000000001',
  roster: 'clroster000000000000000001',
  fromPerson: 'clperson000000000000000002',
  toPerson: 'clperson000000000000000003',
  organizationUnit: 'clorg00000000000000000001',
};

describe('prepareDecisionGuards', () => {
  it('serializes shift-swap guards as closing period, roster, then person locks', async () => {
    const calls: string[] = [];
    const tx = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          type: WorkflowType.SHIFT_SWAP,
          entityType: 'Shift',
          entityId: ids.shift,
          requestPayload: {
            shiftId: ids.shift,
            fromPersonId: ids.fromPerson,
            toPersonId: ids.toPerson,
            reason: 'Exchange this scheduled shift.',
          },
        }),
      },
      shift: {
        findUnique: vi.fn().mockResolvedValue({
          rosterId: ids.roster,
          startTime: new Date('2026-08-01T08:00:00.000Z'),
          endTime: new Date('2026-08-01T16:00:00.000Z'),
          roster: { organizationUnitId: ids.organizationUnit },
        }),
      },
      $queryRaw: vi.fn(async (_strings: TemplateStringsArray, key: string) => {
        calls.push(key);
        return [{ acquired: true }];
      }),
    };
    const closingLockHelper = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(async () => {
        calls.push('closing-period');
      }),
    };

    const attempt = await prepareDecisionGuards({
      tx: tx as never,
      workflowId: ids.workflow,
      requestedAction: 'APPROVE',
      actorId: 'clactor000000000000000001',
      closingLockHelper: closingLockHelper as never,
      recordBlockedAttempt: vi.fn(),
    });

    expect(attempt).toMatchObject({
      attemptedAction: 'WORKFLOW_SHIFT_SWAP_APPROVE',
      entityId: ids.shift,
    });
    expect(calls).toEqual([
      'closing-period',
      `cueq:roster-write:${ids.roster}`,
      `cueq:person-write:${ids.fromPerson}`,
      `cueq:person-write:${ids.toPerson}`,
    ]);
  });
});
