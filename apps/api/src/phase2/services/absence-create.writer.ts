/** Performs one fully transaction-local absence creation in its established serial order. */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { type Absence, AbsenceStatus, type Prisma, WorkflowType } from '@cueq/database';
import type { CreateAbsence } from '@cueq/shared';
import { lockPersonWrites } from '../helpers/transaction-lock.helper.js';
import type {
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
} from '../helpers/workflow-utils.js';

type AuditWriter = {
  appendAudit: (
    input: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      before?: Prisma.JsonValue;
      after?: Prisma.JsonValue;
      reason?: string;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<unknown>;
};

type WorkflowAssignmentBuilder = {
  buildWorkflowAssignment: (
    input: WorkflowAssignmentInput,
    tx: Prisma.TransactionClient,
  ) => Promise<WorkflowAssignmentResult>;
};

export async function writeAbsenceCreation(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    parsed: CreateAbsence;
    targetPerson: { id: string; organizationUnitId: string; supervisorId: string | null };
    start: Date;
    end: Date;
    daySpan: number;
    status: AbsenceStatus;
    requiresApproval: boolean;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    workflowRuntimeService: WorkflowAssignmentBuilder;
    auditHelper: AuditWriter;
  },
): Promise<Absence> {
  const {
    actorId,
    parsed,
    targetPerson,
    start,
    end,
    daySpan,
    status,
    requiresApproval,
    assertClosingUnlocked,
    workflowRuntimeService,
    auditHelper,
  } = input;
  await assertClosingUnlocked(tx);
  const assignment = requiresApproval
    ? await workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.LEAVE_REQUEST,
          requesterId: targetPerson.id,
          requesterOrganizationUnitId: targetPerson.organizationUnitId,
          preferredApproverId: targetPerson.supervisorId ?? undefined,
        },
        tx,
      )
    : undefined;
  await lockPersonWrites(tx, [parsed.personId]);
  const currentTargetPerson = await tx.person.findUnique({
    where: { id: parsed.personId },
    select: { organizationUnitId: true, supervisorId: true },
  });
  if (!currentTargetPerson) {
    throw new NotFoundException('Person not found.');
  }
  if (
    currentTargetPerson.organizationUnitId !== targetPerson.organizationUnitId ||
    currentTargetPerson.supervisorId !== targetPerson.supervisorId
  ) {
    throw new ConflictException({
      code: 'PERSON_IDENTITY_CHANGED',
      message: 'Person assignment changed; retry the absence request.',
      retryable: true,
    });
  }

  const overlappingAbsence = await tx.absence.findFirst({
    where: {
      personId: parsed.personId,
      status: { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlappingAbsence) {
    throw new ConflictException('Absence overlaps with an existing absence.');
  }

  const absence = await tx.absence.create({
    data: {
      personId: parsed.personId,
      type: parsed.type,
      startDate: start,
      endDate: end,
      days: daySpan,
      status,
      note: parsed.note,
    },
  });

  if (assignment) {
    const workflow = await tx.workflowInstance.create({
      data: {
        type: WorkflowType.LEAVE_REQUEST,
        status: assignment.status,
        requesterId: targetPerson.id,
        approverId: assignment.approverId,
        entityType: 'Absence',
        entityId: absence.id,
        reason: parsed.note,
        requestPayload: {
          type: parsed.type,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });
    await auditHelper.appendAudit(
      {
        actorId,
        action: 'WORKFLOW_CREATED',
        entityType: 'WorkflowInstance',
        entityId: workflow.id,
        after: {
          type: workflow.type,
          status: workflow.status,
          approverId: workflow.approverId,
          entityType: workflow.entityType,
          entityId: workflow.entityId,
          dueAt: workflow.dueAt?.toISOString() ?? null,
          traversedApprovers: assignment.traversedApprovers,
        },
        reason: parsed.note,
      },
      tx,
    );
  }

  await auditHelper.appendAudit(
    {
      actorId,
      action: status === AbsenceStatus.REQUESTED ? 'ABSENCE_REQUESTED' : 'ABSENCE_RECORDED',
      entityType: 'Absence',
      entityId: absence.id,
      after: {
        personId: absence.personId,
        type: absence.type,
        startDate: absence.startDate.toISOString(),
        endDate: absence.endDate.toISOString(),
        status: absence.status,
      },
    },
    tx,
  );

  return absence;
}
