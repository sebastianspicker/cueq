import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { WorkflowsDomainService } from './workflows-domain.service';

const ids = {
  workflow: 'clwflow000000000000000001',
  absence: 'clabsence00000000000000001',
  person: 'clperson000000000000000001',
};

describe('WorkflowsDomainService decision write guards', () => {
  it('guards the absence range before locking the affected person and deciding', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        calls.push('person-lock');
        return [{ acquired: true }];
      }),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          entityType: 'Absence',
          entityId: ids.absence,
          requestPayload: {},
        }),
      },
      absence: {
        findUnique: vi.fn().mockResolvedValue({
          personId: ids.person,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-02T00:00:00.000Z'),
          person: { organizationUnitId: 'clorg00000000000000000001' },
        }),
      },
      person: {
        findUnique: vi.fn().mockResolvedValue({
          organizationUnitId: 'clorg00000000000000000001',
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (database: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const personHelper = {
      personForUser: vi.fn().mockResolvedValue({
        id: 'clactor000000000000000001',
        organizationUnitId: 'clorg00000000000000000001',
      }),
    };
    const runtime = {
      normalizeAction: vi.fn().mockReturnValue('APPROVE'),
      decide: vi.fn(async () => {
        calls.push('decide');
        return { updated: { id: ids.workflow } };
      }),
    };
    const sideEffects = {
      validatePreApproval: vi.fn().mockResolvedValue(undefined),
      applyDecisionSideEffects: vi.fn().mockResolvedValue(undefined),
    };
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn(async () => {
        calls.push('closing-guard');
      }),
    };
    const service = new WorkflowsDomainService(
      prisma as never,
      personHelper as never,
      runtime as never,
      {} as never,
      sideEffects as never,
      closingLock as never,
    );

    await service.decideWorkflow(
      {
        subject: 'subject',
        email: 'lead@example.test',
        role: Role.TEAM_LEAD,
        claims: {},
      },
      ids.workflow,
      { action: 'APPROVE' },
    );

    expect(calls).toEqual(['closing-guard', 'person-lock', 'decide']);
    expect(closingLock.assertClosingPeriodUnlockedForRangeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationUnitId: 'clorg00000000000000000001',
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-02T00:00:00.000Z'),
      }),
      tx,
    );
  });

  it('reroutes a transaction-time closing conflict through the durable audit path', async () => {
    const locked = new ConflictException({ code: 'CLOSING_PERIOD_LOCKED' });
    const tx = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue({
          entityType: 'Absence',
          entityId: ids.absence,
          requestPayload: {},
        }),
      },
      absence: {
        findUnique: vi.fn().mockResolvedValue({
          personId: ids.person,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-02T00:00:00.000Z'),
          person: { organizationUnitId: 'clorg00000000000000000001' },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (database: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const closingLock = {
      assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockRejectedValue(locked),
      rethrowWithDurableClosingAudit: vi.fn().mockRejectedValue(locked),
    };
    const service = new WorkflowsDomainService(
      prisma as never,
      {
        personForUser: vi.fn().mockResolvedValue({
          id: 'clactor000000000000000001',
          organizationUnitId: 'clorg00000000000000000001',
        }),
      } as never,
      { normalizeAction: vi.fn().mockReturnValue('APPROVE') } as never,
      {} as never,
      {} as never,
      closingLock as never,
    );

    await expect(
      service.decideWorkflow(
        { subject: 'subject', email: 'lead@example.test', role: Role.TEAM_LEAD, claims: {} },
        ids.workflow,
        { action: 'APPROVE' },
      ),
    ).rejects.toBe(locked);

    expect(closingLock.rethrowWithDurableClosingAudit).toHaveBeenCalledWith(
      locked,
      expect.objectContaining({
        actorId: 'clactor000000000000000001',
        attemptedAction: 'WORKFLOW_ABSENCE_APPROVE',
        entityType: 'Absence',
        entityId: ids.absence,
      }),
    );
  });
});
