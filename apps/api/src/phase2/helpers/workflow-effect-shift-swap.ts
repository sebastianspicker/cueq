import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { ShiftSwapRequestSchema } from '@cueq/shared';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

type ShiftSwapDatabase = Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person' | 'auditEntry'>;

export async function applyShiftSwapEffect(
  actorId: string,
  decision: WorkflowDecisionResult,
  reason: string | undefined,
  prisma: Pick<PrismaService, '$transaction'> & ShiftSwapDatabase,
  auditHelper: Pick<AuditHelper, 'appendAudit'>,
  tx?: ShiftSwapDatabase,
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
  const applySwapAndAudit = async (db: ShiftSwapDatabase) => {
    await runShiftSwap(db, shiftId, swapPayload);
    await auditHelper.appendAudit(
      {
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
      },
      db,
    );
  };

  if (tx) {
    await applySwapAndAudit(tx);
  } else {
    await prisma.$transaction(async (innerTx) => applySwapAndAudit(innerTx));
  }
}

async function runShiftSwap(
  db: ShiftSwapDatabase,
  shiftId: string,
  swapPayload: { fromPersonId: string; toPersonId: string },
) {
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    include: { assignments: true, roster: { select: { organizationUnitId: true } } },
  });
  if (!shift) throw new NotFoundException('Shift not found for approved swap.');
  const toPerson = await db.person.findUnique({
    where: { id: swapPayload.toPersonId },
    select: { id: true, organizationUnitId: true },
  });
  if (!toPerson) throw new NotFoundException('toPersonId person no longer exists.');
  if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
    throw new BadRequestException('toPersonId must belong to the shift roster organization unit.');
  }
  const fromAssignment = shift.assignments.find(
    (assignment) => assignment.personId === swapPayload.fromPersonId,
  );
  if (!fromAssignment) {
    throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
  }
  if (shift.assignments.some((assignment) => assignment.personId === swapPayload.toPersonId)) {
    throw new BadRequestException('toPersonId assignment already exists on shift.');
  }
  const overlappingAssignment = await db.shiftAssignment.findFirst({
    where: {
      personId: swapPayload.toPersonId,
      shift: {
        id: { not: shift.id },
        startTime: { lt: shift.endTime },
        endTime: { gt: shift.startTime },
      },
    },
    select: { id: true },
  });
  if (overlappingAssignment) {
    throw new BadRequestException('toPersonId has an overlapping assigned shift.');
  }
  await db.shiftAssignment.delete({ where: { id: fromAssignment.id } });
  await db.shiftAssignment.create({
    data: { shiftId: shift.id, personId: swapPayload.toPersonId },
  });
  if (shift.personId === swapPayload.fromPersonId) {
    await db.shift.update({
      where: { id: shift.id },
      data: { personId: swapPayload.toPersonId },
    });
  }
}
