import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, type Prisma } from '@cueq/database';
import { evaluateOnCallRestCompliance } from '@cueq/core';
import { ListOnCallDeploymentsQuerySchema, ListOnCallRotationsQuerySchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { APPROVAL_ROLES, assertCanActForPerson } from '../helpers/role-constants.js';
import { onCallDateWindowWhere } from './oncall-date-window.js';

type OnCallActor = { id: string; organizationUnitId: string };

export function listOnCallRotations(
  prisma: PrismaService,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  query: unknown,
) {
  if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
    throw new ForbiddenException('Role does not permit reading rotations.');
  }

  const parsed = ListOnCallRotationsQuerySchema.parse(query ?? {});
  const where: Prisma.OnCallRotationWhereInput = {
    personId: parsed.personId,
    organizationUnitId: parsed.organizationUnitId,
    ...onCallDateWindowWhere(parsed),
  };
  if (user.role === Role.EMPLOYEE) where.personId = actor.id;
  else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
    where.organizationUnitId = actor.organizationUnitId;
  }
  return prisma.onCallRotation.findMany({ where, orderBy: { startTime: 'asc' } });
}

export async function listOnCallDeployments(
  prisma: PrismaService,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  query: unknown,
) {
  if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
    throw new ForbiddenException('Role does not permit reading deployments.');
  }

  const parsed = ListOnCallDeploymentsQuerySchema.parse(query ?? {});
  const where: Prisma.OnCallDeploymentWhereInput = {
    personId: parsed.personId,
    rotation: parsed.organizationUnitId
      ? { organizationUnitId: parsed.organizationUnitId }
      : undefined,
    ...onCallDateWindowWhere(parsed),
  };
  if (user.role === Role.EMPLOYEE) where.personId = actor.id;
  else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
    where.rotation = { organizationUnitId: actor.organizationUnitId };
  }

  const deployments = await prisma.onCallDeployment.findMany({
    where,
    orderBy: { startTime: 'asc' },
  });
  return deployments.map((deployment) => ({
    id: deployment.id,
    personId: deployment.personId,
    rotationId: deployment.rotationId,
    startTime: deployment.startTime.toISOString(),
    endTime: deployment.endTime.toISOString(),
    remote: deployment.remote,
    ticketReference: deployment.ticketReference,
    eventReference: deployment.eventReference,
    description: deployment.description,
  }));
}

export async function onCallCompliance(
  prisma: PrismaService,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  personId?: string,
  nextShiftStart?: string,
) {
  const targetPersonId = personId ?? actor.id;
  assertCanActForPerson(user, actor.id, targetPersonId);
  if (!nextShiftStart) {
    throw new BadRequestException('nextShiftStart query parameter is required.');
  }

  const shiftStart = new Date(nextShiftStart);
  if (Number.isNaN(shiftStart.getTime())) {
    throw new BadRequestException('nextShiftStart must be a valid ISO datetime.');
  }
  const deployments = await prisma.onCallDeployment.findMany({
    where: { personId: targetPersonId, startTime: { lt: shiftStart } },
    orderBy: { endTime: 'desc' },
    take: 20,
  });
  const activeRotation = await prisma.onCallRotation.findFirst({
    where: {
      personId: targetPersonId,
      startTime: { lte: shiftStart },
      endTime: { gte: shiftStart },
    },
    orderBy: { startTime: 'desc' },
  });
  const result = evaluateOnCallRestCompliance({
    rotationStart:
      activeRotation?.startTime.toISOString() ??
      deployments[deployments.length - 1]?.startTime.toISOString() ??
      nextShiftStart,
    rotationEnd:
      activeRotation?.endTime.toISOString() ??
      deployments[0]?.endTime.toISOString() ??
      nextShiftStart,
    nextShiftStart,
    deployments: deployments.map((deployment) => ({
      start: deployment.startTime.toISOString(),
      end: deployment.endTime.toISOString(),
    })),
  });

  return { personId: targetPersonId, rotationId: activeRotation?.id ?? null, ...result };
}
