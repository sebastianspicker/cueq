/** Owns absence mutations caused by an approved workflow. */
import { Inject, Injectable } from '@nestjs/common';
import { AbsenceStatus, WorkflowType } from '@cueq/database';
import type {
  AbsenceWorkflowEffectsPort,
  WorkflowEffectInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { AuditHelper } from '../audit/public.js';

@Injectable()
export class WorkflowAbsenceEffectsService implements AbsenceWorkflowEffectsPort {
  constructor(@Inject(AuditHelper) private readonly auditHelper: AuditHelper) {}

  async applyWorkflowEffect({ actorId, action, decision, reason, tx }: WorkflowEffectInput) {
    if (decision.type !== WorkflowType.LEAVE_REQUEST || decision.entityType !== 'Absence') return;

    const nextStatus =
      action === 'APPROVE'
        ? AbsenceStatus.APPROVED
        : action === 'REJECT'
          ? AbsenceStatus.REJECTED
          : action === 'CANCEL'
            ? AbsenceStatus.CANCELLED
            : null;
    if (!nextStatus) return;

    const current = await tx.absence.findUnique({
      where: { id: decision.entityId },
      select: { status: true },
    });
    const result = await tx.absence.updateMany({
      where: {
        id: decision.entityId,
        status:
          nextStatus === AbsenceStatus.CANCELLED
            ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
            : AbsenceStatus.REQUESTED,
      },
      data: { status: nextStatus },
    });
    if (result.count === 0) return;

    await this.auditHelper.appendAudit(
      {
        actorId,
        action:
          nextStatus === AbsenceStatus.APPROVED
            ? 'ABSENCE_APPROVED'
            : nextStatus === AbsenceStatus.REJECTED
              ? 'ABSENCE_REJECTED'
              : 'ABSENCE_CANCELLED',
        entityType: 'Absence',
        entityId: decision.entityId,
        before: { status: current?.status ?? null },
        after: { status: nextStatus },
        reason,
      },
      tx,
    );
  }
}
