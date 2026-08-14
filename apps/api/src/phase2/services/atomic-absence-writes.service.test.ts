import { ConflictException } from '@nestjs/common';
import { AbsenceStatus, Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { AbsenceDomainService } from './absence-domain.service.js';
import {
  ABSENCE_ID,
  ACTOR_ID,
  ORGANIZATION_UNIT_ID,
  absenceService,
  closingLock,
  personForActor,
  transactionPrisma,
  user,
} from './atomic-domain-writes.test-support.js';

describe('atomic domain writes', () => {
  it('keeps absence, workflow, and both audits in the transaction when an audit write fails', async () => {
    const writes: string[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
      absence: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async () => {
          writes.push('absence');
          return {
            id: ABSENCE_ID,
            personId: ACTOR_ID,
            type: 'ANNUAL_LEAVE',
            startDate: new Date('2026-07-14T00:00:00.000Z'),
            endDate: new Date('2026-07-14T00:00:00.000Z'),
            status: AbsenceStatus.REQUESTED,
          };
        }),
      },
      workflowInstance: {
        create: vi.fn().mockImplementation(async () => {
          writes.push('workflow');
          return {
            id: 'ckz00000000000000000000006',
            type: WorkflowType.LEAVE_REQUEST,
            status: WorkflowStatus.PENDING,
            approverId: 'ckz00000000000000000000007',
            entityType: 'Absence',
            entityId: ABSENCE_ID,
            dueAt: null,
          };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
      absence: { create: vi.fn() },
      workflowInstance: { create: vi.fn() },
    };
    const auditHelper = {
      appendAudit: vi.fn().mockImplementation(async (input, db) => {
        expect(db).toBe(tx);
        writes.push(input.action);
        if (input.action === 'ABSENCE_REQUESTED') throw new Error('audit write failed');
      }),
    };
    const workflowRuntimeService = {
      buildWorkflowAssignment: vi.fn().mockImplementation(async (_input, db) => {
        expect(db).toBe(tx);
        return {
          status: WorkflowStatus.PENDING,
          approverId: 'ckz00000000000000000000007',
          submittedAt: new Date('2026-07-14T08:00:00.000Z'),
          dueAt: null,
          escalationLevel: 0,
          delegationTrail: [],
          traversedApprovers: ['ckz00000000000000000000007'],
        };
      }),
    };
    const service = absenceService(prisma, auditHelper, workflowRuntimeService);

    await expect(
      service.createAbsence(user as never, {
        personId: ACTOR_ID,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
      }),
    ).rejects.toThrow('audit write failed');

    expect(writes).toEqual(['absence', 'workflow', 'WORKFLOW_CREATED', 'ABSENCE_REQUESTED']);
    expect(workflowRuntimeService.buildWorkflowAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkflowType.LEAVE_REQUEST,
        requesterId: ACTOR_ID,
        requesterOrganizationUnitId: ORGANIZATION_UNIT_ID,
      }),
      tx,
    );
    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      `cueq:person-write:${ACTOR_ID}`,
    ]);
    const assignmentCallOrder =
      workflowRuntimeService.buildWorkflowAssignment.mock.invocationCallOrder.at(0);
    const personLockCallOrder = tx.$queryRaw.mock.invocationCallOrder.at(0);
    if (assignmentCallOrder === undefined || personLockCallOrder === undefined) {
      throw new Error('Expected assignment and person-lock calls.');
    }
    expect(assignmentCallOrder).toBeLessThan(personLockCallOrder);
    expect(prisma.absence.create).not.toHaveBeenCalled();
    expect(prisma.workflowInstance.create).not.toHaveBeenCalled();
  });

  it('aborts absence creation when the locked person changed supervisor or organization unit', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: 'ckz00000000000000000000999',
          supervisorId: 'ckz00000000000000000000008',
        }),
      },
      absence: { findFirst: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: ACTOR_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'ckz00000000000000000000007',
        }),
      },
    };
    const service = absenceService(
      prisma,
      { appendAudit: vi.fn() },
      { buildWorkflowAssignment: vi.fn() },
    );

    await expect(
      service.createAbsence(user as never, {
        personId: ACTOR_ID,
        type: 'SICK',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
      }),
    ).rejects.toMatchObject({ response: { code: 'PERSON_IDENTITY_CHANGED', retryable: true } });

    expect(tx.absence.create).not.toHaveBeenCalled();
  });

  it('serializes absence dates and decimal days to the public response contract', async () => {
    const prisma = {
      absence: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: ABSENCE_ID,
            personId: ACTOR_ID,
            type: 'ANNUAL_LEAVE',
            startDate: new Date('2026-07-14T00:00:00.000Z'),
            endDate: new Date('2026-07-16T00:00:00.000Z'),
            days: { toNumber: () => 3 },
            status: AbsenceStatus.APPROVED,
            note: null,
            createdAt: new Date('2026-07-01T08:00:00.000Z'),
            updatedAt: new Date('2026-07-02T09:00:00.000Z'),
          },
        ]),
      },
    };
    const service = absenceService(prisma, {}, {});

    await expect(service.listMyAbsences(user as never)).resolves.toEqual([
      {
        id: ABSENCE_ID,
        personId: ACTOR_ID,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-07-14',
        endDate: '2026-07-16',
        days: 3,
        status: AbsenceStatus.APPROVED,
        note: null,
        createdAt: '2026-07-01T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
    ]);
  });

  it('cancels only a re-read active absence, then cancels pending workflows and audits in order', async () => {
    const writes: string[] = [];
    const absence = {
      id: ABSENCE_ID,
      personId: ACTOR_ID,
      type: 'ANNUAL_LEAVE',
      startDate: new Date('2026-07-14T00:00:00.000Z'),
      endDate: new Date('2026-07-14T00:00:00.000Z'),
      days: { toNumber: () => 1 },
      status: AbsenceStatus.APPROVED,
      note: null,
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      updatedAt: new Date('2026-07-02T09:00:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn(async () => {
        writes.push('person-lock');
        return [{ acquired: true }];
      }),
      person: {
        findUnique: vi.fn(async () => {
          writes.push('person-reread');
          return { organizationUnitId: ORGANIZATION_UNIT_ID };
        }),
      },
      absence: {
        findUnique: vi.fn(async () => {
          writes.push('absence-reread');
          return absence;
        }),
        update: vi.fn(async () => {
          writes.push('absence-cancel');
          return { ...absence, status: AbsenceStatus.CANCELLED };
        }),
      },
      workflowInstance: {
        updateMany: vi.fn(async () => {
          writes.push('workflow-cancel');
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      absence: { findUnique: vi.fn().mockResolvedValue(absence) },
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_input, db) => {
        expect(db).toBe(tx);
        writes.push('audit');
      }),
    };
    const service = absenceService(prisma, auditHelper, {});

    await expect(service.cancelAbsence(user as never, ABSENCE_ID)).resolves.toMatchObject({
      id: ABSENCE_ID,
      status: AbsenceStatus.CANCELLED,
    });

    expect(writes).toEqual([
      'person-lock',
      'person-reread',
      'absence-reread',
      'absence-cancel',
      'workflow-cancel',
      'audit',
    ]);
    expect(tx.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
          },
        }),
        data: expect.objectContaining({
          status: WorkflowStatus.CANCELLED,
          approverId: ACTOR_ID,
          decisionReason: 'absence cancelled by requester',
        }),
      }),
    );
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ABSENCE_CANCELLED', entityId: ABSENCE_ID }),
      tx,
    );
  });

  it('keeps cancellation workflow updates inside the transaction when its audit write fails', async () => {
    const writes: string[] = [];
    const absence = {
      id: ABSENCE_ID,
      personId: ACTOR_ID,
      type: 'SICK',
      startDate: new Date('2026-07-14T00:00:00.000Z'),
      endDate: new Date('2026-07-14T00:00:00.000Z'),
      days: { toNumber: () => 1 },
      status: AbsenceStatus.REQUESTED,
      note: null,
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      updatedAt: new Date('2026-07-02T09:00:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
      absence: {
        findUnique: vi.fn().mockResolvedValue(absence),
        update: vi.fn(async () => {
          writes.push('absence');
          return { ...absence, status: AbsenceStatus.CANCELLED };
        }),
      },
      workflowInstance: {
        updateMany: vi.fn(async () => {
          writes.push('workflow');
          return { count: 1 };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      absence: { findUnique: vi.fn().mockResolvedValue(absence) },
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (_input, db) => {
        expect(db).toBe(tx);
        writes.push('audit');
        throw new Error('cancellation audit write failed');
      }),
    };
    const service = absenceService(prisma, auditHelper, {});

    await expect(service.cancelAbsence(user as never, ABSENCE_ID)).rejects.toThrow(
      'cancellation audit write failed',
    );

    expect(writes).toEqual(['absence', 'workflow', 'audit']);
    expect(prisma.absence.findUnique).toHaveBeenCalledOnce();
  });

  it('routes a transaction-time absence cancellation closing conflict through durable audit', async () => {
    const absence = {
      id: ABSENCE_ID,
      personId: ACTOR_ID,
      startDate: new Date('2026-07-14T00:00:00.000Z'),
      endDate: new Date('2026-07-14T00:00:00.000Z'),
      status: AbsenceStatus.APPROVED,
    };
    const conflict = new ConflictException({ code: 'CLOSING_PERIOD_LOCKED' });
    const durableAudit = vi.fn((error: unknown) => {
      throw error;
    });
    const prisma = {
      ...transactionPrisma({}),
      absence: { findUnique: vi.fn().mockResolvedValue(absence) },
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const service = new AbsenceDomainService(
      prisma as never,
      personForActor() as never,
      {} as never,
      {
        assertClosingPeriodUnlockedForRange: vi.fn().mockResolvedValue(undefined),
        assertClosingPeriodUnlockedForRangeInTransaction: vi.fn().mockRejectedValue(conflict),
        rethrowWithDurableClosingAudit: durableAudit,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.cancelAbsence(user as never, ABSENCE_ID)).rejects.toBe(conflict);

    expect(durableAudit).toHaveBeenCalledWith(
      conflict,
      expect.objectContaining({
        attemptedAction: 'ABSENCE_CANCEL',
        entityId: ABSENCE_ID,
        organizationUnitId: ORGANIZATION_UNIT_ID,
      }),
    );
  });

  it('locks and re-reads the person before creating and auditing a leave adjustment', async () => {
    const writes: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        writes.push('person-lock');
        return [{ acquired: true }];
      }),
      person: {
        findUnique: vi.fn(async () => {
          writes.push('person-reread');
          return { organizationUnitId: ORGANIZATION_UNIT_ID };
        }),
      },
      leaveAdjustment: {
        create: vi.fn(async () => {
          writes.push('adjustment');
          return {
            id: 'ckz00000000000000000000009',
            personId: ACTOR_ID,
            year: 2026,
            deltaDays: 2,
            reason: 'Carry-over correction',
          };
        }),
      },
    };
    const prisma = {
      ...transactionPrisma(tx),
      person: {
        findUnique: vi.fn().mockResolvedValue({ organizationUnitId: ORGANIZATION_UNIT_ID }),
      },
    };
    const auditHelper = {
      appendAudit: vi.fn(async (input, db) => {
        expect(db).toBe(tx);
        writes.push(input.action);
      }),
    };
    const service = new AbsenceDomainService(
      prisma as never,
      personForActor() as never,
      auditHelper as never,
      closingLock() as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createLeaveAdjustment({ ...user, role: Role.HR } as never, {
        personId: ACTOR_ID,
        year: 2026,
        deltaDays: 2,
        reason: 'Carry-over correction',
      }),
    ).resolves.toMatchObject({ deltaDays: 2 });

    expect(writes).toEqual([
      'person-lock',
      'person-reread',
      'adjustment',
      'LEAVE_ADJUSTMENT_CREATED',
    ]);
  });
});
