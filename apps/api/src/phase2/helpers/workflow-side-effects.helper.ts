import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbsenceStatus, Role, WorkflowType } from '@cueq/database';
import { ShiftSwapRequestSchema, OvertimeApprovalRequestSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import { AuditHelper } from './audit.helper';
import type { WorkflowDecisionResult } from './workflow-utils';

@Injectable()
export class WorkflowSideEffectsHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async validatePreApproval(
    workflowId: string,
    tx?: Pick<PrismaService, 'workflowInstance' | 'shift' | 'person' | 'timeAccount'>,
  ) {
    const db = tx ?? this.prisma;
    const workflow = await db.workflowInstance.findUnique({
      where: { id: workflowId },
      select: { id: true, type: true, entityType: true, entityId: true, requestPayload: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    if (workflow.type === WorkflowType.SHIFT_SWAP && workflow.entityType === 'Shift') {
      const requestPayload = ShiftSwapRequestSchema.parse(workflow.requestPayload ?? {});
      const shiftId = requestPayload.shiftId || workflow.entityId;
      const shift = await db.shift.findUnique({
        where: { id: shiftId },
        include: {
          assignments: true,
          roster: { select: { organizationUnitId: true } },
        },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found for approved swap.');
      }

      const toPerson = await db.person.findUnique({
        where: { id: requestPayload.toPersonId },
        select: { id: true, organizationUnitId: true },
      });
      if (!toPerson) {
        throw new NotFoundException('toPersonId person no longer exists.');
      }
      if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
        throw new BadRequestException(
          'toPersonId must belong to the shift roster organization unit.',
        );
      }

      if (!shift.assignments.some((a) => a.personId === requestPayload.fromPersonId)) {
        throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
      }
      if (shift.assignments.some((a) => a.personId === requestPayload.toPersonId)) {
        throw new BadRequestException('toPersonId assignment already exists on shift.');
      }
    }

    if (workflow.type === WorkflowType.OVERTIME_APPROVAL && workflow.entityType === 'TimeAccount') {
      const requestPayload = OvertimeApprovalRequestSchema.parse(workflow.requestPayload ?? {});
      const periodStart = new Date(requestPayload.periodStart);
      const periodEnd = new Date(requestPayload.periodEnd);
      const account = await db.timeAccount.findFirst({
        where: {
          personId: requestPayload.personId,
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodEnd },
        },
        select: { id: true },
        orderBy: { periodStart: 'desc' },
      });
      if (!account) {
        throw new BadRequestException('No matching time account found for overtime approval.');
      }
    }
  }

  async validatePostCloseSelfApproval(
    actorId: string,
    workflow: { requesterId: string; type: string },
    reason?: string,
  ) {
    if (workflow.type !== WorkflowType.POST_CLOSE_CORRECTION) return;
    if (workflow.requesterId !== actorId) return;

    const alternateApprover = await this.prisma.person.findFirst({
      where: {
        role: { in: [Role.HR, Role.ADMIN] },
        id: { not: actorId },
      },
      select: { id: true },
    });
    if (alternateApprover) {
      throw new ForbiddenException(
        'Post-close correction cannot be self-approved while another HR/Admin exists.',
      );
    }
    if (!reason?.includes('[self-approval]')) {
      throw new BadRequestException(
        'Self-approval requires explicit reason flag: include "[self-approval]" in reason.',
      );
    }
  }

  async applyDecisionSideEffects(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'absence' | 'shift' | 'shiftAssignment' | 'person' | 'timeAccount'>,
  ) {
    await this.applyLeaveRequestEffect(actorId, decision, reason, tx);
    await this.applyShiftSwapEffect(actorId, decision, reason, tx);
    await this.applyOvertimeEffect(actorId, decision, reason, tx);
  }

  private async applyLeaveRequestEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'absence'>,
  ) {
    const db = tx ?? this.prisma;
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

    if (!nextAbsenceStatus) {
      return;
    }

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

    if (result.count > 0) {
      await this.auditHelper.appendAudit({
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
      });
    }
  }

  private async applyShiftSwapEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person'>,
  ) {
    if (
      decision.updated.type !== WorkflowType.SHIFT_SWAP ||
      decision.updated.entityType !== 'Shift' ||
      decision.action !== 'APPROVE'
    ) {
      return;
    }

    const swapPayload = ShiftSwapRequestSchema.parse(decision.updated.requestPayload ?? {});
    const shiftId = swapPayload.shiftId || decision.updated.entityId;
    const runSwap = async (db: Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person'>) => {
      const shift = await db.shift.findUnique({
        where: { id: shiftId },
        include: {
          assignments: true,
          roster: { select: { organizationUnitId: true } },
        },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found for approved swap.');
      }
      const toPerson = await db.person.findUnique({
        where: { id: swapPayload.toPersonId },
        select: { id: true, organizationUnitId: true },
      });
      if (!toPerson) {
        throw new NotFoundException('toPersonId person no longer exists.');
      }
      if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
        throw new BadRequestException(
          'toPersonId must belong to the shift roster organization unit.',
        );
      }
      const fromAssignment = shift.assignments.find((a) => a.personId === swapPayload.fromPersonId);
      if (!fromAssignment) {
        throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
      }
      if (shift.assignments.some((a) => a.personId === swapPayload.toPersonId)) {
        throw new BadRequestException('toPersonId assignment already exists on shift.');
      }
      await db.shiftAssignment.delete({ where: { id: fromAssignment.id } });
      await db.shiftAssignment.create({
        data: { shiftId: shift.id, personId: swapPayload.toPersonId },
      });
    };

    if (tx) {
      await runSwap(tx);
    } else {
      await this.prisma.$transaction(async (innerTx) => runSwap(innerTx));
    }

    await this.auditHelper.appendAudit({
      actorId,
      action: 'SHIFT_SWAP_APPLIED',
      entityType: 'Shift',
      entityId: decision.updated.entityId,
      after: {
        fromPersonId: swapPayload.fromPersonId,
        toPersonId: swapPayload.toPersonId,
        workflowId: decision.updated.id,
      },
      reason,
    });
  }

  private async applyOvertimeEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'timeAccount'>,
  ) {
    const db = tx ?? this.prisma;
    if (
      decision.updated.type !== WorkflowType.OVERTIME_APPROVAL ||
      decision.updated.entityType !== 'TimeAccount' ||
      decision.action !== 'APPROVE'
    ) {
      return;
    }

    const otPayload = OvertimeApprovalRequestSchema.parse(decision.updated.requestPayload ?? {});
    const periodStart = new Date(otPayload.periodStart);
    const periodEnd = new Date(otPayload.periodEnd);

    const account = await db.timeAccount.findFirst({
      where: {
        personId: otPayload.personId,
        periodStart: { lte: periodStart },
        periodEnd: { gte: periodEnd },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (!account) {
      throw new NotFoundException('No matching time account found for overtime approval.');
    }

    const nextOvertimeHours =
      Number(Number(account.overtimeHours).toFixed(2)) + otPayload.overtimeHours;
    const updated = await db.timeAccount.update({
      where: { id: account.id },
      data: { overtimeHours: Number(nextOvertimeHours.toFixed(2)) },
    });

    await this.auditHelper.appendAudit({
      actorId,
      action: 'OVERTIME_APPROVED',
      entityType: 'TimeAccount',
      entityId: updated.id,
      before: { overtimeHours: Number(account.overtimeHours) },
      after: {
        overtimeHours: Number(updated.overtimeHours),
        workflowId: decision.updated.id,
      },
      reason,
    });
  }
}
