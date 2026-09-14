import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, type Prisma } from '@cueq/database';
import { evaluateOnCallRestCompliance } from '@cueq/domain';
import { ListOnCallDeploymentsQuerySchema, ListOnCallRotationsQuerySchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { APPROVAL_ROLES, assertCanActForPerson, type AssignmentHelper } from '../people/public.js';
import { onCallDateWindowWhere } from './oncall-date-window.js';

type OnCallActor = { id: string; organizationUnitId: string };

export async function listOnCallRotations(
  prisma: PrismaService,
  assignmentHelper: AssignmentHelper,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  query: unknown,
) {
  if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
    throw new ForbiddenException('Role does not permit reading rotations.');
  }

  const parsed = ListOnCallRotationsQuerySchema.parse(query ?? {});
  const scopedPersonId = user.role === Role.EMPLOYEE ? actor.id : parsed.personId;
  const assignmentId = scopedPersonId
    ? (
        await assignmentHelper.selectAssignment(
          scopedPersonId,
          parsed.assignmentId,
          undefined,
          parsed.from ? new Date(parsed.from) : undefined,
        )
      ).id
    : parsed.assignmentId;
  const where: Prisma.OnCallRotationWhereInput = {
    personId: parsed.personId,
    assignmentId,
    organizationUnitId: parsed.organizationUnitId,
    ...onCallDateWindowWhere(parsed),
  };
  if (user.role === Role.EMPLOYEE) where.personId = actor.id;
  else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
    where.organizationUnitId = actor.organizationUnitId;
  }
  const rows = await prisma.onCallRotation.findMany({
    where: { AND: [where, cursorWhere('startTime', parsed.cursor)] },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: parsed.limit + 1,
  });
  return cursorPage(
    rows,
    parsed.limit,
    'startTime',
    (row) => row.startTime,
    (row) => ({
      id: row.id,
      personId: row.personId,
      assignmentId: row.assignmentId,
      organizationUnitId: row.organizationUnitId,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      rotationType: row.rotationType,
      note: row.note,
    }),
  );
}

export async function listOnCallDeployments(
  prisma: PrismaService,
  assignmentHelper: AssignmentHelper,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  query: unknown,
) {
  if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
    throw new ForbiddenException('Role does not permit reading deployments.');
  }

  const parsed = ListOnCallDeploymentsQuerySchema.parse(query ?? {});
  const scopedPersonId = user.role === Role.EMPLOYEE ? actor.id : parsed.personId;
  const assignmentId = scopedPersonId
    ? (
        await assignmentHelper.selectAssignment(
          scopedPersonId,
          parsed.assignmentId,
          undefined,
          parsed.from ? new Date(parsed.from) : undefined,
        )
      ).id
    : parsed.assignmentId;
  const where: Prisma.OnCallDeploymentWhereInput = {
    personId: parsed.personId,
    assignmentId,
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
    where: { AND: [where, cursorWhere('startTime', parsed.cursor)] },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: parsed.limit + 1,
  });
  return cursorPage(
    deployments,
    parsed.limit,
    'startTime',
    (row) => row.startTime,
    (deployment) => ({
      id: deployment.id,
      personId: deployment.personId,
      assignmentId: deployment.assignmentId,
      rotationId: deployment.rotationId,
      startTime: deployment.startTime.toISOString(),
      endTime: deployment.endTime.toISOString(),
      remote: deployment.remote,
      ticketReference: deployment.ticketReference,
      eventReference: deployment.eventReference,
      description: deployment.description,
    }),
  );
}

export async function onCallCompliance(
  prisma: PrismaService,
  assignmentHelper: AssignmentHelper,
  user: AuthenticatedIdentity,
  actor: OnCallActor,
  personId?: string,
  nextShiftStart?: string,
  assignmentId?: string,
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
  const assignment = await assignmentHelper.selectAssignment(
    targetPersonId,
    assignmentId,
    undefined,
    shiftStart,
  );
  // Deployments stay person-wide because rest obligations follow the person
  // across concurrent appointments.
  const deployments = await prisma.onCallDeployment.findMany({
    where: { personId: targetPersonId, startTime: { lt: shiftStart } },
    orderBy: { endTime: 'desc' },
    take: 20,
  });
  const activeRotation = await prisma.onCallRotation.findFirst({
    where: {
      personId: targetPersonId,
      assignmentId: assignment.id,
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
