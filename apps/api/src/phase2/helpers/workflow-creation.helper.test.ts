import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowCreationHelper } from './workflow-creation.helper.js';

const REQUESTER_ID = 'clrequester000000000000001';
const OTHER_PERSON_ID = 'clperson000000000000000001';
const ORGANIZATION_UNIT_ID = 'clorg00000000000000000001';
const BOOKING_ID = 'clbooking00000000000000001';
const SHIFT_ID = 'clshift0000000000000000001';
const TIME_ACCOUNT_ID = 'claccount00000000000000001';

const user = {
  subject: 'subject-1',
  email: 'admin@example.test',
  role: Role.ADMIN,
  claims: {},
} as const;

function assignment(type: WorkflowType) {
  return {
    status: WorkflowStatus.PENDING,
    approverId: 'clapprover0000000000000001',
    submittedAt: new Date('2026-07-16T08:00:00.000Z'),
    dueAt: new Date('2026-07-17T08:00:00.000Z'),
    escalationLevel: 0,
    delegationTrail: ['clapprover0000000000000001'],
    traversedApprovers: ['clapprover0000000000000001'],
    escalated: false,
    policy: { type },
  };
}

describe('WorkflowCreationHelper routing transaction', () => {
  it('computes and persists each workflow assignment through the same transaction client', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      booking: {
        findUnique: vi.fn(async (query: { select?: { personId: boolean } }) =>
          query.select
            ? { personId: REQUESTER_ID }
            : {
                id: BOOKING_ID,
                personId: REQUESTER_ID,
                person: {
                  id: REQUESTER_ID,
                  organizationUnitId: ORGANIZATION_UNIT_ID,
                  supervisorId: null,
                },
              },
        ),
      },
      shift: {
        findUnique: vi.fn(async (query: { select?: { rosterId: boolean } }) =>
          query.select
            ? { rosterId: 'clroster000000000000000001' }
            : {
                id: SHIFT_ID,
                rosterId: 'clroster000000000000000001',
                assignments: [{ personId: REQUESTER_ID }],
                roster: { organizationUnitId: ORGANIZATION_UNIT_ID },
              },
        ),
      },
      person: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === OTHER_PERSON_ID
            ? { id: OTHER_PERSON_ID, organizationUnitId: ORGANIZATION_UNIT_ID }
            : {
                id: REQUESTER_ID,
                organizationUnitId: ORGANIZATION_UNIT_ID,
                supervisorId: null,
              },
        ),
      },
      timeAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: TIME_ACCOUNT_ID }),
      },
      workflowInstance: {
        create: vi.fn(async ({ data }: { data: { type: WorkflowType } }) => ({
          id: `clworkflow-${data.type}`,
          ...data,
        })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const runtime = {
      buildWorkflowAssignment: vi.fn(async (input: { type: WorkflowType }, db: typeof tx) => {
        expect(db).toBe(tx);
        return assignment(input.type);
      }),
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const helper = new WorkflowCreationHelper(
      prisma as never,
      {
        personForUser: vi.fn().mockResolvedValue({
          id: REQUESTER_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
          supervisorId: 'clstalesupervisor0000000001',
        }),
      } as never,
      auditHelper as never,
      runtime as never,
    );

    await helper.createBookingCorrection(user as never, {
      bookingId: BOOKING_ID,
      reason: 'Correct the recorded booking time.',
    });
    await helper.createShiftSwapWorkflow(user as never, {
      shiftId: SHIFT_ID,
      fromPersonId: REQUESTER_ID,
      toPersonId: OTHER_PERSON_ID,
      reason: 'Swap this shift because of a conflict.',
    });
    await helper.createOvertimeApprovalWorkflow(user as never, {
      personId: REQUESTER_ID,
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-02T00:00:00.000Z',
      overtimeHours: 2,
      reason: 'Approve the documented additional work.',
    });

    expect(runtime.buildWorkflowAssignment.mock.calls).toEqual([
      [
        expect.objectContaining({
          type: WorkflowType.BOOKING_CORRECTION,
          requesterOrganizationUnitId: ORGANIZATION_UNIT_ID,
          preferredApproverId: undefined,
        }),
        tx,
      ],
      [
        expect.objectContaining({
          type: WorkflowType.SHIFT_SWAP,
          requesterOrganizationUnitId: ORGANIZATION_UNIT_ID,
        }),
        tx,
      ],
      [
        expect.objectContaining({
          type: WorkflowType.OVERTIME_APPROVAL,
          requesterOrganizationUnitId: ORGANIZATION_UNIT_ID,
          preferredApproverId: undefined,
        }),
        tx,
      ],
    ]);
    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      `cueq:person-write:${REQUESTER_ID}`,
      'cueq:policy-write:workflow-routing',
      'cueq:roster-write:clroster000000000000000001',
      `cueq:person-write:${OTHER_PERSON_ID}`,
      `cueq:person-write:${REQUESTER_ID}`,
      'cueq:policy-write:workflow-routing',
      `cueq:person-write:${REQUESTER_ID}`,
    ]);
    expect(tx.workflowInstance.create).toHaveBeenCalledTimes(3);
    expect(auditHelper.appendAudit.mock.calls.map((call) => call[1])).toEqual([tx, tx, tx]);
    expect(auditHelper.appendAudit.mock.calls.map(([entry]) => entry.after)).toEqual([
      expect.objectContaining({
        type: WorkflowType.BOOKING_CORRECTION,
        traversedApprovers: ['clapprover0000000000000001'],
      }),
      expect.objectContaining({
        type: WorkflowType.SHIFT_SWAP,
        shiftId: SHIFT_ID,
        fromPersonId: REQUESTER_ID,
        toPersonId: OTHER_PERSON_ID,
      }),
      expect.objectContaining({
        type: WorkflowType.OVERTIME_APPROVAL,
        personId: REQUESTER_ID,
        timeAccountId: TIME_ACCOUNT_ID,
        overtimeHours: 2,
      }),
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('fails retryably when booking ownership changes after selecting the person lock', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      booking: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ personId: REQUESTER_ID })
          .mockResolvedValueOnce({
            id: BOOKING_ID,
            personId: OTHER_PERSON_ID,
            person: {
              id: OTHER_PERSON_ID,
              organizationUnitId: ORGANIZATION_UNIT_ID,
              supervisorId: null,
            },
          }),
      },
      workflowInstance: { create: vi.fn() },
    };
    const runtime = { buildWorkflowAssignment: vi.fn() };
    const helper = new WorkflowCreationHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      {
        personForUser: vi.fn().mockResolvedValue({
          id: REQUESTER_ID,
          supervisorId: null,
        }),
      } as never,
      { appendAudit: vi.fn() } as never,
      runtime as never,
    );

    await expect(
      helper.createBookingCorrection(user as never, {
        bookingId: BOOKING_ID,
        reason: 'Correct the recorded booking time.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_OWNER_CHANGED', retryable: true },
    });

    expect(runtime.buildWorkflowAssignment).not.toHaveBeenCalled();
    expect(tx.workflowInstance.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      `cueq:person-write:${REQUESTER_ID}`,
    ]);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.booking.findUnique.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('fails retryably when a shift moves to another roster before the locked re-read', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      shift: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ rosterId: 'clroster000000000000000001' })
          .mockResolvedValueOnce({
            id: SHIFT_ID,
            rosterId: 'clroster000000000000000002',
            assignments: [{ personId: REQUESTER_ID }],
            roster: { organizationUnitId: ORGANIZATION_UNIT_ID },
          }),
      },
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: OTHER_PERSON_ID,
          organizationUnitId: ORGANIZATION_UNIT_ID,
        }),
      },
      workflowInstance: { create: vi.fn() },
    };
    const runtime = { buildWorkflowAssignment: vi.fn() };
    const helper = new WorkflowCreationHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      { personForUser: vi.fn().mockResolvedValue({ id: REQUESTER_ID }) } as never,
      { appendAudit: vi.fn() } as never,
      runtime as never,
    );

    await expect(
      helper.createShiftSwapWorkflow(user as never, {
        shiftId: SHIFT_ID,
        fromPersonId: REQUESTER_ID,
        toPersonId: OTHER_PERSON_ID,
        reason: 'Swap this shift because of a conflict.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SHIFT_ROSTER_CHANGED', retryable: true },
    });

    expect(runtime.buildWorkflowAssignment).not.toHaveBeenCalled();
    expect(tx.workflowInstance.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      'cueq:roster-write:clroster000000000000000001',
      `cueq:person-write:${OTHER_PERSON_ID}`,
      `cueq:person-write:${REQUESTER_ID}`,
    ]);
  });
});
