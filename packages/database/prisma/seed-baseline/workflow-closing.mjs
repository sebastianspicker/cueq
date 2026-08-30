/** Seeds workflow-routing, time-account, closing, and audit data after time operations. */
import { ClosingStatus, WorkflowStatus, WorkflowType } from '@prisma/client';

export async function seedWorkflowClosing(prisma, IDs) {
  await prisma.workflowPolicy.createMany({
    data: [
      {
        id: IDs.workflowPolicyLeave,
        type: WorkflowType.LEAVE_REQUEST,
        escalationDeadlineHours: 48,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.workflowPolicyCorrection,
        type: WorkflowType.BOOKING_CORRECTION,
        escalationDeadlineHours: 48,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: IDs.workflowPolicyPostClose,
        type: WorkflowType.POST_CLOSE_CORRECTION,
        escalationDeadlineHours: 24,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 5,
        activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });

  await prisma.workflowDelegationRule.create({
    data: {
      id: IDs.delegationLeadToHr,
      delegatorId: IDs.personLead,
      delegateId: IDs.personHr,
      workflowType: WorkflowType.BOOKING_CORRECTION,
      organizationUnitId: IDs.ouAdmin,
      activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
      priority: 1,
      createdById: IDs.personAdmin,
    },
  });

  await prisma.workflowInstance.create({
    data: {
      id: IDs.workflowCorrection,
      type: WorkflowType.BOOKING_CORRECTION,
      status: WorkflowStatus.PENDING,
      requesterId: IDs.personEmployee,
      approverId: IDs.personLead,
      entityType: 'Booking',
      entityId: IDs.bookingEmployeeIn,
      reason: 'Bitte Startzeit korrigieren',
      submittedAt: new Date('2026-03-03T09:00:00.000Z'),
      dueAt: new Date('2026-03-05T09:00:00.000Z'),
      escalationLevel: 0,
      delegationTrail: ['c000000000000000000000101'],
      createdAt: new Date('2026-03-03T09:00:00.000Z'),
    },
  });

  await prisma.timeAccount.create({
    data: {
      id: IDs.timeAccountEmployee,
      personId: IDs.personEmployee,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      targetHours: 159.2,
      actualHours: 160.1,
      balance: 0.9,
      overtimeHours: 0.9,
    },
  });

  await prisma.closingPeriod.create({
    data: {
      id: IDs.closingPeriod,
      organizationUnitId: IDs.ouAdmin,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      status: ClosingStatus.REVIEW,
    },
  });

  await prisma.auditEntry.createMany({
    data: [
      {
        id: IDs.auditSeed,
        timestamp: new Date('2026-03-15T12:00:00.000Z'),
        actorId: IDs.personAdmin,
        action: 'BASELINE_SEED_COMPLETED',
        entityType: 'SeedRun',
        entityId: 'baseline-default',
        after: { seeded: true, seededAt: '2026-03-15T12:00:00.000Z' },
        reason: 'Synthetic deterministic acceptance baseline',
        ipAddress: '127.0.0.1',
      },
    ],
    skipDuplicates: true,
  });
}
