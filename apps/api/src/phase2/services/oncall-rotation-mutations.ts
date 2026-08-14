import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@cueq/database';
import type { CreateOnCallRotation, UpdateOnCallRotation } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../helpers/audit.helper.js';
import { lockPersonWrites } from '../helpers/transaction-lock.helper.js';

type OnCallRotationMutationDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
};

type RotationMutationContext = OnCallRotationMutationDependencies & {
  user: AuthenticatedIdentity;
  actorId: string;
};

function assertRotationOrganizationScope(
  user: AuthenticatedIdentity,
  actorOrganizationUnitId: string | null,
  organizationUnitId: string,
  action: 'create' | 'update',
): void {
  if (
    (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
    organizationUnitId !== actorOrganizationUnitId
  ) {
    throw new ForbiddenException(
      `Team leads and shift planners can only ${action} rotations in their own unit.`,
    );
  }
}

export function assertCanCreateOnCallRotationInOrganization(
  user: AuthenticatedIdentity,
  actorOrganizationUnitId: string | null,
  organizationUnitId: string,
): void {
  assertRotationOrganizationScope(user, actorOrganizationUnitId, organizationUnitId, 'create');
}

async function createRotation(tx: Prisma.TransactionClient, parsed: CreateOnCallRotation) {
  return tx.onCallRotation.create({
    data: {
      personId: parsed.personId,
      organizationUnitId: parsed.organizationUnitId,
      startTime: new Date(parsed.startTime),
      endTime: new Date(parsed.endTime),
      rotationType: parsed.rotationType,
      note: parsed.note,
    },
  });
}

async function appendRotationCreatedAudit(
  auditHelper: AuditHelper,
  actorId: string,
  rotation: {
    id: string;
    personId: string;
    organizationUnitId: string;
    startTime: Date;
    endTime: Date;
    rotationType: string;
  },
  tx: Prisma.TransactionClient,
): Promise<void> {
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'ONCALL_ROTATION_CREATED',
      entityType: 'OnCallRotation',
      entityId: rotation.id,
      after: {
        personId: rotation.personId,
        organizationUnitId: rotation.organizationUnitId,
        startTime: rotation.startTime.toISOString(),
        endTime: rotation.endTime.toISOString(),
        rotationType: rotation.rotationType,
      },
    },
    tx,
  );
}

export async function createOnCallRotationMutation(
  context: RotationMutationContext,
  parsed: CreateOnCallRotation,
): Promise<unknown> {
  return context.prisma.$transaction(async (tx) => {
    await lockPersonWrites(tx, [parsed.personId]);
    const person = await tx.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person for on-call rotation was not found.');
    }
    if (person.organizationUnitId !== parsed.organizationUnitId) {
      throw new BadRequestException(
        'On-call rotation organizationUnitId must match the person organization unit.',
      );
    }

    const rotation = await createRotation(tx, parsed);
    await appendRotationCreatedAudit(context.auditHelper, context.actorId, rotation, tx);

    return rotation;
  });
}

async function assertRotationStillContainsDeployments(
  tx: Prisma.TransactionClient,
  rotationId: string,
  nextStartTime: Date,
  nextEndTime: Date,
): Promise<void> {
  const excludedDeployment = await tx.onCallDeployment.findFirst({
    where: {
      rotationId,
      OR: [{ startTime: { lt: nextStartTime } }, { endTime: { gt: nextEndTime } }],
    },
    select: { id: true },
  });
  if (excludedDeployment) {
    throw new BadRequestException('Rotation window cannot exclude an existing on-call deployment.');
  }
}

async function updateRotation(
  tx: Prisma.TransactionClient,
  rotationId: string,
  parsed: UpdateOnCallRotation,
) {
  return tx.onCallRotation.update({
    where: { id: rotationId },
    data: {
      startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
      endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
      rotationType: parsed.rotationType,
      note: parsed.note,
    },
  });
}

async function appendRotationUpdatedAudit(
  auditHelper: AuditHelper,
  actorId: string,
  current: { startTime: Date; endTime: Date; rotationType: string },
  updated: { id: string; startTime: Date; endTime: Date; rotationType: string },
  tx: Prisma.TransactionClient,
): Promise<void> {
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'ONCALL_ROTATION_UPDATED',
      entityType: 'OnCallRotation',
      entityId: updated.id,
      before: {
        startTime: current.startTime.toISOString(),
        endTime: current.endTime.toISOString(),
        rotationType: current.rotationType,
      },
      after: {
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        rotationType: updated.rotationType,
      },
    },
    tx,
  );
}

export async function updateOnCallRotationMutation(
  context: RotationMutationContext,
  rotationId: string,
  existing: { personId: string },
  actorOrganizationUnitId: string | null,
  parsed: UpdateOnCallRotation,
): Promise<unknown> {
  return context.prisma.$transaction(async (tx) => {
    await lockPersonWrites(tx, [existing.personId]);
    const current = await tx.onCallRotation.findUnique({ where: { id: rotationId } });
    if (!current) {
      throw new NotFoundException('On-call rotation not found.');
    }

    assertRotationOrganizationScope(
      context.user,
      actorOrganizationUnitId,
      current.organizationUnitId,
      'update',
    );

    const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : current.startTime;
    const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : current.endTime;
    if (nextStartTime >= nextEndTime) {
      throw new BadRequestException('startTime must be before endTime.');
    }

    await assertRotationStillContainsDeployments(tx, current.id, nextStartTime, nextEndTime);
    const updated = await updateRotation(tx, current.id, parsed);
    await appendRotationUpdatedAudit(context.auditHelper, context.actorId, current, updated, tx);

    return updated;
  });
}
