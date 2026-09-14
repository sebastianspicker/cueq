import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@cueq/database';
import type { CreateOnCallRotation, UpdateOnCallRotation } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type { AssignmentHelper, ResolvedEmployment } from '../people/public.js';

type OnCallRotationMutationDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
};

type RotationMutationContext = OnCallRotationMutationDependencies & {
  user: AuthenticatedIdentity;
  actorId: string;
  assignmentHelper: Pick<AssignmentHelper, 'assertUnchanged'>;
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

async function createRotation(
  tx: Prisma.TransactionClient,
  parsed: CreateOnCallRotation,
  assignmentId: string,
) {
  return tx.onCallRotation.create({
    data: {
      personId: parsed.personId,
      assignmentId,
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
    assignmentId: string;
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
        assignmentId: rotation.assignmentId,
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
  resolved: ResolvedEmployment,
): Promise<unknown> {
  return context.prisma.$transaction(async (tx) => {
    await lockPersonWrites(tx, [parsed.personId]);
    const current = await context.assignmentHelper.assertUnchanged(
      tx,
      resolved,
      new Date(parsed.startTime),
      new Date(parsed.endTime),
    );
    if (current.organizationUnitId !== parsed.organizationUnitId) {
      throw new BadRequestException(
        'On-call rotation organizationUnitId must match the effective appointment term.',
      );
    }

    const rotation = await createRotation(tx, parsed, current.assignment.id);
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
  resolved: ResolvedEmployment,
): Promise<unknown> {
  return context.prisma.$transaction(async (tx) => {
    await lockPersonWrites(tx, [existing.personId]);
    const current = await tx.onCallRotation.findUnique({ where: { id: rotationId } });
    if (!current) {
      throw new NotFoundException('On-call rotation not found.');
    }
    if (current.assignmentId !== resolved.assignment.id) {
      throw new BadRequestException('On-call rotation appointment changed; retry the update.');
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
    const currentEmployment = await context.assignmentHelper.assertUnchanged(
      tx,
      resolved,
      nextStartTime,
      nextEndTime,
    );
    if (currentEmployment.organizationUnitId !== current.organizationUnitId) {
      throw new BadRequestException(
        'Updated rotation window must remain within its appointment organization unit.',
      );
    }

    await assertRotationStillContainsDeployments(tx, current.id, nextStartTime, nextEndTime);
    const updated = await updateRotation(tx, current.id, parsed);
    await appendRotationUpdatedAudit(context.auditHelper, context.actorId, current, updated, tx);

    return updated;
  });
}
