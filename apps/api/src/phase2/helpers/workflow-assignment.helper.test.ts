import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { WorkflowAssignmentHelper } from './workflow-assignment.helper.js';
import { resolveBaseApprover } from './workflow-assignment-routing.js';

describe('WorkflowAssignmentHelper post-close assignment', () => {
  it('never falls back to the requester when no independent HR/Admin approver exists', async () => {
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const approver = await resolveBaseApprover(
      {
        type: WorkflowType.POST_CLOSE_CORRECTION,
        requesterId: 'clrequester000000000000001',
        requesterOrganizationUnitId: 'clorg00000000000000000001',
      },
      prisma as never,
    );

    expect(approver).toBeNull();
    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'clrequester000000000000001' } }),
      }),
    );
  });

  it('uses the supplied transaction client for the routing lock, policy, people, and delegations', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowPolicy: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'clpolicy000000000000000001',
          type: WorkflowType.LEAVE_REQUEST,
          escalationDeadlineHours: 24,
          escalationRoles: [],
          maxDelegationDepth: 2,
          activeFrom: new Date('2026-07-16T08:00:00.000Z'),
          activeTo: null,
          createdAt: new Date('2026-07-16T08:00:00.000Z'),
          updatedAt: new Date('2026-07-16T08:00:00.000Z'),
        }),
        create: vi.fn(),
      },
      person: {
        findFirst: vi.fn().mockResolvedValue({ id: 'clapprover0000000000000001' }),
        findMany: vi.fn(),
      },
      workflowDelegationRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      $transaction: vi.fn(),
      workflowPolicy: { findFirst: vi.fn(), create: vi.fn() },
      person: { findFirst: vi.fn(), findMany: vi.fn() },
      workflowDelegationRule: { findMany: vi.fn() },
    };
    const helper = new WorkflowAssignmentHelper(prisma as never, {} as never);

    const assignment = await helper.buildWorkflowAssignment(
      {
        type: WorkflowType.LEAVE_REQUEST,
        requesterId: 'clrequester000000000000001',
        requesterOrganizationUnitId: 'clorg00000000000000000001',
        requestedAt: new Date('2026-07-16T09:00:00.000Z'),
      },
      tx as never,
    );

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
    ]);
    expect(tx.workflowPolicy.findFirst).toHaveBeenCalledOnce();
    expect(tx.person.findFirst).toHaveBeenCalled();
    expect(tx.workflowDelegationRule.findMany).toHaveBeenCalledOnce();
    expect(assignment.approverId).toBe('clapprover0000000000000001');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.workflowPolicy.findFirst).not.toHaveBeenCalled();
    expect(prisma.person.findFirst).not.toHaveBeenCalled();
    expect(prisma.workflowDelegationRule.findMany).not.toHaveBeenCalled();
  });
});

describe('WorkflowAssignmentHelper automatic escalation', () => {
  const NOW = new Date('2026-07-16T10:00:00.000Z');
  const workflow = {
    id: 'clworkflow00000000000000001',
    type: WorkflowType.LEAVE_REQUEST,
    status: WorkflowStatus.PENDING,
    requesterId: 'clrequester000000000000001',
    approverId: 'clapprover0000000000000001',
    delegationTrail: ['clapprover0000000000000001'],
    submittedAt: new Date('2026-07-16T08:00:00.000Z'),
    createdAt: new Date('2026-07-16T08:00:00.000Z'),
    dueAt: new Date('2026-07-16T09:00:00.000Z'),
    escalationLevel: 0,
  };

  const escalationPolicy = {
    escalationRoles: [Role.HR],
    escalationDeadlineHours: 24,
    maxDelegationDepth: 1,
  };

  function escalationTransaction(freshWorkflow: object, updateCount: number) {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowInstance: {
        findUnique: vi.fn().mockResolvedValue(freshWorkflow),
        updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
      },
      workflowPolicy: { findFirst: vi.fn().mockResolvedValue(escalationPolicy) },
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: 'clorg00000000000000000001' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'clhr000000000000000000001' }),
      },
    };
  }

  function escalationPrisma<T>(tx: T) {
    return {
      workflowInstance: { findMany: vi.fn().mockResolvedValue([workflow]) },
      $transaction: vi.fn(async (callback: (db: T) => Promise<unknown>) => callback(tx)),
      person: { findUnique: vi.fn(), findFirst: vi.fn() },
      workflowPolicy: { findFirst: vi.fn() },
    };
  }

  it('locks, routes, updates, and audits each candidate through one transaction', async () => {
    const freshWorkflow = {
      ...workflow,
      approverId: 'cldelegate00000000000000001',
      delegationTrail: ['clapprover0000000000000001', 'cldelegate00000000000000001'],
    };
    const tx = escalationTransaction(freshWorkflow, 1);
    const prisma = escalationPrisma(tx);
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new WorkflowAssignmentHelper(prisma as never, auditHelper as never);

    await expect(helper.escalateOverdueWorkflows(NOW)).resolves.toEqual({ escalated: 1 });

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
    ]);
    expect(tx.workflowInstance.findUnique).toHaveBeenCalledWith({ where: { id: workflow.id } });
    expect(tx.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: workflow.id,
          status: WorkflowStatus.PENDING,
          escalationLevel: 0,
          approverId: freshWorkflow.approverId,
          delegationTrail: { equals: freshWorkflow.delegationTrail },
          dueAt: { equals: freshWorkflow.dueAt, lte: NOW },
        }),
      }),
    );
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WORKFLOW_ESCALATED', entityId: workflow.id }),
      tx,
    );
    expect(tx.workflowInstance.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      auditHelper.appendAudit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(prisma.person.findUnique).not.toHaveBeenCalled();
    expect(prisma.person.findFirst).not.toHaveBeenCalled();
    expect(prisma.workflowPolicy.findFirst).not.toHaveBeenCalled();
  });

  it('does not route, update, or audit when the locked re-read is stale', async () => {
    const tx = escalationTransaction({ ...workflow, status: WorkflowStatus.APPROVED }, 0);
    const prisma = escalationPrisma(tx);
    const auditHelper = { appendAudit: vi.fn() };
    const helper = new WorkflowAssignmentHelper(prisma as never, auditHelper as never);

    await expect(helper.escalateOverdueWorkflows(NOW)).resolves.toEqual({ escalated: 0 });

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
    ]);
    expect(tx.workflowPolicy.findFirst).not.toHaveBeenCalled();
    expect(tx.person.findUnique).not.toHaveBeenCalled();
    expect(tx.person.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowInstance.updateMany).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the fresh approver or deadline changes before the CAS update', async () => {
    const tx = escalationTransaction(workflow, 0);
    const prisma = escalationPrisma(tx);
    const auditHelper = { appendAudit: vi.fn() };
    const helper = new WorkflowAssignmentHelper(prisma as never, auditHelper as never);

    await expect(helper.escalateOverdueWorkflows(NOW)).resolves.toEqual({ escalated: 0 });

    expect(tx.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approverId: workflow.approverId,
          delegationTrail: { equals: workflow.delegationTrail },
          dueAt: { equals: workflow.dueAt, lte: NOW },
        }),
      }),
    );
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });
});
