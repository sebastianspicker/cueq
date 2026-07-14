import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { WorkflowRuntimeService } from './workflow-runtime.service';

describe('WorkflowRuntimeService decision compare-and-swap', () => {
  it('returns a retryable conflict instead of writing an audit entry when the workflow changed', async () => {
    const workflow = {
      id: 'clworkflow00000000000000001',
      status: WorkflowStatus.PENDING,
      type: WorkflowType.LEAVE_REQUEST,
      requesterId: 'clrequester000000000000001',
      approverId: 'clapprover0000000000000001',
      delegationTrail: ['clapprover0000000000000001'],
      decisionReason: null,
      decidedAt: null,
    };
    const prisma = {
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue(workflow),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn(),
      },
    };
    const auditHelper = { appendAudit: vi.fn() };
    const runtime = new WorkflowRuntimeService(
      prisma as never,
      auditHelper as never,
      {} as never,
      {} as never,
      { validatePostCloseSelfApproval: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      runtime.decide(
        {
          id: 'clapprover0000000000000001',
          role: Role.TEAM_LEAD,
          organizationUnitId: 'clorg00000000000000000001',
        },
        { workflowId: workflow.id, action: 'APPROVE' },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'WORKFLOW_DECISION_IN_PROGRESS',
        retryable: true,
      },
    });

    expect(prisma.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: workflow.id,
          status: WorkflowStatus.PENDING,
          approverId: workflow.approverId,
          delegationTrail: { equals: workflow.delegationTrail },
        }),
      }),
    );
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('locks and validates the delegate through the decision transaction before changing assignee', async () => {
    const workflow = {
      id: 'clworkflow00000000000000001',
      status: WorkflowStatus.PENDING,
      type: WorkflowType.LEAVE_REQUEST,
      requesterId: 'clrequester000000000000001',
      approverId: 'clapprover0000000000000001',
      delegationTrail: ['clapprover0000000000000001'],
      decisionReason: null,
      decidedAt: null,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue(workflow),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          ...workflow,
          approverId: 'cldelegate0000000000000001',
          delegationTrail: ['clapprover0000000000000001', 'cldelegate0000000000000001'],
        }),
      },
      person: { findUnique: vi.fn() },
      auditEntry: { create: vi.fn() },
    };
    const delegationCrud = {
      validateInlineDelegation: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = new WorkflowRuntimeService(
      {} as never,
      { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      delegationCrud as never,
      {} as never,
    );

    await runtime.decide(
      {
        id: 'clapprover0000000000000001',
        role: Role.TEAM_LEAD,
        organizationUnitId: 'clorg00000000000000000001',
      },
      {
        workflowId: workflow.id,
        action: 'DELEGATE',
        delegateToId: 'cldelegate0000000000000001',
      },
      tx as never,
    );

    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe('cueq:person-write:cldelegate0000000000000001');
    expect(delegationCrud.validateInlineDelegation).toHaveBeenCalledWith(
      expect.objectContaining({ delegateToId: 'cldelegate0000000000000001' }),
      tx,
    );
  });
});
