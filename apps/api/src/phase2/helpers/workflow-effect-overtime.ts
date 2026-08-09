import { NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { OvertimeApprovalRequestSchema } from '@cueq/shared';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

export async function applyOvertimeEffect(
  actorId: string,
  decision: WorkflowDecisionResult,
  reason: string | undefined,
  db: Pick<PrismaService, 'timeAccount' | 'auditEntry'>,
  auditHelper: Pick<AuditHelper, 'appendAudit'>,
) {
  if (
    decision.updated.type !== WorkflowType.OVERTIME_APPROVAL ||
    decision.updated.entityType !== 'TimeAccount' ||
    decision.action !== 'APPROVE'
  ) {
    return;
  }
  const otPayload = OvertimeApprovalRequestSchema.parse(decision.updated.requestPayload ?? {});
  const account = await db.timeAccount.findFirst({
    where: {
      id: decision.updated.entityId,
      personId: otPayload.personId,
      periodStart: { lte: new Date(otPayload.periodStart) },
      periodEnd: { gte: new Date(otPayload.periodEnd) },
    },
    orderBy: { periodStart: 'desc' },
  });
  if (!account)
    throw new NotFoundException('No matching time account found for overtime approval.');

  const nextOvertimeHours =
    Number(Number(account.overtimeHours).toFixed(2)) + otPayload.overtimeHours;
  const updated = await db.timeAccount.update({
    where: { id: account.id },
    data: { overtimeHours: Number(nextOvertimeHours.toFixed(2)) },
  });
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'OVERTIME_APPROVED',
      entityType: 'TimeAccount',
      entityId: updated.id,
      before: { overtimeHours: Number(account.overtimeHours) },
      after: { overtimeHours: Number(updated.overtimeHours), workflowId: decision.updated.id },
      reason,
    },
    db,
  );
}
