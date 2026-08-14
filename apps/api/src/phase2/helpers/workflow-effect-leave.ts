import { AbsenceStatus, WorkflowType } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

export async function applyLeaveRequestEffect(
  actorId: string,
  decision: WorkflowDecisionResult,
  reason: string | undefined,
  db: Pick<PrismaService, 'absence' | 'auditEntry'>,
  auditHelper: Pick<AuditHelper, 'appendAudit'>,
) {
  if (
    decision.updated.type !== WorkflowType.LEAVE_REQUEST ||
    decision.updated.entityType !== 'Absence'
  ) {
    return;
  }
  const nextAbsenceStatus =
    decision.action === 'APPROVE'
      ? AbsenceStatus.APPROVED
      : decision.action === 'REJECT'
        ? AbsenceStatus.REJECTED
        : decision.action === 'CANCEL'
          ? AbsenceStatus.CANCELLED
          : null;
  if (!nextAbsenceStatus) return;

  const currentAbsence = await db.absence.findUnique({
    where: { id: decision.updated.entityId },
    select: { status: true },
  });
  const result = await db.absence.updateMany({
    where: {
      id: decision.updated.entityId,
      status:
        nextAbsenceStatus === AbsenceStatus.CANCELLED
          ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
          : AbsenceStatus.REQUESTED,
    },
    data: { status: nextAbsenceStatus },
  });
  if (result.count === 0) return;

  await auditHelper.appendAudit(
    {
      actorId,
      action:
        nextAbsenceStatus === AbsenceStatus.APPROVED
          ? 'ABSENCE_APPROVED'
          : nextAbsenceStatus === AbsenceStatus.REJECTED
            ? 'ABSENCE_REJECTED'
            : 'ABSENCE_CANCELLED',
      entityType: 'Absence',
      entityId: decision.updated.entityId,
      before: { status: currentAbsence?.status ?? null },
      after: { status: nextAbsenceStatus },
      reason,
    },
    db,
  );
}
