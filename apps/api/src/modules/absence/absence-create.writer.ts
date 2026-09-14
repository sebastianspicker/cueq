/** Performs one fully transaction-local absence creation in its established serial order. */
import { ConflictException } from '@nestjs/common';
import { type Absence, AbsenceStatus, type Prisma, WorkflowType } from '@cueq/database';
import type { CreateAbsence } from '@cueq/contracts';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type {
  WorkflowAssignmentRequest,
  WorkflowAssignment,
} from '../../application/ports/workflow-runtime.port.js';
import type { AssignmentHelper, ResolvedEmployment } from '../people/public.js';

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
    input: WorkflowAssignmentRequest,
    tx: Prisma.TransactionClient,
  ) => Promise<WorkflowAssignment>;
};

export async function writeAbsenceCreation(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    parsed: CreateAbsence;
    resolved: ResolvedEmployment;
    start: Date;
    end: Date;
    endExclusive: Date;
    daySpan: number;
    status: AbsenceStatus;
    requiresApproval: boolean;
    assignmentHelper: Pick<AssignmentHelper, 'assertUnchanged'>;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    workflowRuntimeService: WorkflowAssignmentBuilder;
    auditHelper: AuditWriter;
  },
): Promise<Absence> {
  const {
    actorId,
    parsed,
    resolved,
    start,
    end,
    endExclusive,
    daySpan,
    status,
    requiresApproval,
    assignmentHelper,
    assertClosingUnlocked,
    workflowRuntimeService,
    auditHelper,
  } = input;
  await assertClosingUnlocked(tx);
  const assignment = requiresApproval
    ? await workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.LEAVE_REQUEST,
          requesterId: parsed.personId,
          requesterOrganizationUnitId: resolved.organizationUnitId,
          preferredApproverId: resolved.supervisorId ?? undefined,
        },
        tx,
      )
    : undefined;
  await lockPersonWrites(tx, [parsed.personId]);
  const current = await assignmentHelper.assertUnchanged(tx, resolved, start, endExclusive);

  const overlappingAbsence = await tx.absence.findFirst({
    where: {
      personId: parsed.personId,
      assignmentId: current.assignment.id,
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
      assignmentId: current.assignment.id,
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
        requesterId: parsed.personId,
        assignmentId: current.assignment.id,
        approverId: assignment.approverId,
        entityType: 'Absence',
        entityId: absence.id,
        reason: parsed.note,
        requestPayload: {
          assignmentId: current.assignment.id,
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
        assignmentId: absence.assignmentId,
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
