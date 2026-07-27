import { describe, expect, it, vi } from 'vitest';
import { ClosingStatus, Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { ClosingCorrectionHelper } from './closing-correction.helper.js';

describe('ClosingCorrectionHelper post-close workflow routing', () => {
  it('acquires the closing lock before routing and builds the assignment through the committing transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      closingPeriod: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'clperiod000000000000000001',
          status: ClosingStatus.EXPORTED,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      workflowInstance: {
        create: vi.fn().mockResolvedValue({
          id: 'clworkflow00000000000000001',
          approverId: 'clapprover0000000000000001',
          dueAt: new Date('2026-07-17T08:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtime = {
      buildWorkflowAssignment: vi.fn(async (_input: unknown, db: typeof tx) => {
        expect(db).toBe(tx);
        return {
          status: WorkflowStatus.PENDING,
          approverId: 'clapprover0000000000000001',
          submittedAt: new Date('2026-07-16T08:00:00.000Z'),
          dueAt: new Date('2026-07-17T08:00:00.000Z'),
          escalationLevel: 0,
          delegationTrail: ['clapprover0000000000000001'],
        };
      }),
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new ClosingCorrectionHelper(
      prisma as never,
      {
        personForUser: vi.fn().mockResolvedValue({
          id: 'clrequester000000000000001',
          organizationUnitId: 'clorg00000000000000000001',
          role: Role.HR,
        }),
      } as never,
      auditHelper as never,
      runtime as never,
    );

    await helper.postCloseCorrection(
      { subject: 'subject-1', email: 'hr@example.test', role: Role.HR, claims: {} } as never,
      'clperiod000000000000000001',
      'Correct the closed period.',
    );

    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe(
      'cueq:closing-period-write:clperiod000000000000000001',
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.buildWorkflowAssignment.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(runtime.buildWorkflowAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkflowType.POST_CLOSE_CORRECTION }),
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });
});
