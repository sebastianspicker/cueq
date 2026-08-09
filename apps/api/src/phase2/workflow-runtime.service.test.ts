import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

describe('WorkflowRuntimeService decision compare-and-swap', () => {
  it.each([
    ['APPROVE', WorkflowStatus.APPROVED, Role.TEAM_LEAD, 'clapprover0000000000000001'],
    ['REJECT', WorkflowStatus.REJECTED, Role.TEAM_LEAD, 'clapprover0000000000000001'],
    ['CANCEL', WorkflowStatus.CANCELLED, Role.EMPLOYEE, 'clrequester000000000000001'],
  ] as const)(
    'keeps the successful %s decision order transaction-local',
    async (action, nextStatus, role, actorId) => {
      const events: string[] = [];
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
      const updated = { ...workflow, status: nextStatus };
      const tx = {
        workflowInstance: {
          findUnique: vi.fn().mockImplementation(async () => {
            events.push('fetch');
            return workflow;
          }),
          updateMany: vi.fn().mockImplementation(async () => {
            events.push('compare-and-swap');
            return { count: 1 };
          }),
          findUniqueOrThrow: vi.fn().mockImplementation(async () => {
            events.push('re-fetch');
            return updated;
          }),
        },
      };
      const auditHelper = {
        appendAudit: vi.fn().mockImplementation(async () => {
          events.push('audit');
        }),
      };
      const sideEffects = {
        validatePostCloseSelfApproval: vi.fn().mockImplementation(async () => {
          events.push('self-approval validation');
        }),
      };
      const runtime = new WorkflowRuntimeService(
        {} as never,
        auditHelper as never,
        {} as never,
        {} as never,
        sideEffects as never,
      );

      const result = await runtime.decide(
        { id: actorId, role, organizationUnitId: 'clorg00000000000000000001' },
        { workflowId: workflow.id, action },
        tx as never,
      );

      expect(result).toEqual({ action, previous: workflow, updated });
      expect(events).toEqual([
        'fetch',
        ...(action === 'APPROVE' ? ['self-approval validation'] : []),
        'compare-and-swap',
        're-fetch',
        'audit',
      ]);
      expect(tx.workflowInstance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: nextStatus }) }),
      );
    },
  );

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
    const events: string[] = [];
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
      $queryRaw: vi.fn().mockImplementation(async () => {
        events.push('delegate lock');
        return [{ acquired: true }];
      }),
      workflowInstance: {
        findUnique: vi.fn().mockImplementation(async () => {
          events.push('fetch');
          return workflow;
        }),
        updateMany: vi.fn().mockImplementation(async () => {
          events.push('compare-and-swap');
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => {
          events.push('re-fetch');
          return {
            ...workflow,
            approverId: 'cldelegate0000000000000001',
            delegationTrail: ['clapprover0000000000000001', 'cldelegate0000000000000001'],
          };
        }),
      },
      person: { findUnique: vi.fn() },
      auditEntry: { create: vi.fn() },
    };
    const delegationCrud = {
      validateInlineDelegation: vi.fn().mockImplementation(async () => {
        events.push('delegate validation');
      }),
    };
    const runtime = new WorkflowRuntimeService(
      {} as never,
      {
        appendAudit: vi.fn().mockImplementation(async () => {
          events.push('audit');
        }),
      } as never,
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
    expect(events).toEqual([
      'fetch',
      'delegate lock',
      'delegate validation',
      'compare-and-swap',
      're-fetch',
      'audit',
    ]);
  });
});

describe('WorkflowRuntimeService inbox visibility', () => {
  it('keeps the actor-scoped query and filters only overdue visible workflows after mapping actions', async () => {
    const actor = {
      id: 'clrequester000000000000001',
      role: Role.EMPLOYEE,
      organizationUnitId: 'clorg00000000000000000001',
    };
    const overdue = {
      id: 'clworkflow00000000000000001',
      status: WorkflowStatus.PENDING,
      type: WorkflowType.LEAVE_REQUEST,
      requesterId: actor.id,
      approverId: 'clapprover0000000000000001',
      delegationTrail: [],
      reason: 'Private request reason',
      decisionReason: null,
      dueAt: new Date('2000-01-01T00:00:00.000Z'),
    };
    const future = {
      ...overdue,
      id: 'clworkflow00000000000000002',
      dueAt: new Date('2999-01-01T00:00:00.000Z'),
    };
    const prisma = { workflowInstance: { findMany: vi.fn().mockResolvedValue([overdue, future]) } };
    const runtime = new WorkflowRuntimeService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      runtime.listInbox(actor, {
        status: WorkflowStatus.PENDING,
        type: WorkflowType.LEAVE_REQUEST,
        overdueOnly: true,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: overdue.id, reason: overdue.reason, isOverdue: true }),
    ]);

    expect(prisma.workflowInstance.findMany).toHaveBeenCalledWith({
      where: {
        status: WorkflowStatus.PENDING,
        type: WorkflowType.LEAVE_REQUEST,
        OR: [{ requesterId: actor.id }, { approverId: actor.id }],
      },
      orderBy: { createdAt: 'asc' },
    });
  });
});
