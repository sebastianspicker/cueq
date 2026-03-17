import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, Role, type Prisma } from '@cueq/database';
import { evaluateOnCallRestCompliance } from '@cueq/core';
import {
  CreateOnCallRotationSchema,
  CreateOnCallDeploymentSchema,
  ListOnCallRotationsQuerySchema,
  ListOnCallDeploymentsQuerySchema,
  UpdateOnCallRotationSchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { APPROVAL_ROLES, assertCanActForPerson } from '../helpers/role-constants';

@Injectable()
export class OncallDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async createOnCallRotation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Only approval-capable roles can manage on-call rotations.');
    }

    const parsedPayload = CreateOnCallRotationSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException(
        parsedPayload.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const parsed = parsedPayload.data;
    if (
      (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
      parsed.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException(
        'Team leads and shift planners can only create rotations in their own unit.',
      );
    }

    const person = await this.prisma.person.findUnique({
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

    const rotation = await this.prisma.onCallRotation.create({
      data: {
        personId: parsed.personId,
        organizationUnitId: parsed.organizationUnitId,
        startTime: new Date(parsed.startTime),
        endTime: new Date(parsed.endTime),
        rotationType: parsed.rotationType,
        note: parsed.note,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
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
    });

    return rotation;
  }

  async listOnCallRotations(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Role does not permit reading rotations.');
    }

    const parsed = ListOnCallRotationsQuerySchema.parse(query ?? {});
    const fromDate = parsed.from ? new Date(parsed.from) : null;
    const toDate = parsed.to ? new Date(parsed.to) : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be on or before to.');
    }
    const where: Prisma.OnCallRotationWhereInput = {
      personId: parsed.personId,
      organizationUnitId: parsed.organizationUnitId,
    };
    if (fromDate && toDate) {
      where.AND = [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }];
    } else if (fromDate) {
      where.endTime = { gte: fromDate };
    } else if (toDate) {
      where.startTime = { lte: toDate };
    }

    if (user.role === Role.EMPLOYEE) {
      where.personId = actor.id;
    } else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
      where.organizationUnitId = actor.organizationUnitId;
    }

    return this.prisma.onCallRotation.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
  }

  async listOnCallDeployments(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Role does not permit reading deployments.');
    }

    const parsed = ListOnCallDeploymentsQuerySchema.parse(query ?? {});
    const fromDate = parsed.from ? new Date(parsed.from) : null;
    const toDate = parsed.to ? new Date(parsed.to) : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be on or before to.');
    }
    const where: Prisma.OnCallDeploymentWhereInput = {
      personId: parsed.personId,
      rotation: parsed.organizationUnitId
        ? { organizationUnitId: parsed.organizationUnitId }
        : undefined,
    };
    if (fromDate && toDate) {
      where.AND = [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }];
    } else if (fromDate) {
      where.endTime = { gte: fromDate };
    } else if (toDate) {
      where.startTime = { lte: toDate };
    }

    if (user.role === Role.EMPLOYEE) {
      where.personId = actor.id;
    } else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
      where.rotation = { organizationUnitId: actor.organizationUnitId };
    }

    const deployments = await this.prisma.onCallDeployment.findMany({
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

  async updateOnCallRotation(
    user: AuthenticatedIdentity,
    rotationId: string,
    payload: unknown,
  ): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Only approval-capable roles can update on-call rotations.');
    }

    const existing = await this.prisma.onCallRotation.findUnique({ where: { id: rotationId } });
    if (!existing) {
      throw new NotFoundException('On-call rotation not found.');
    }

    if (
      (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
      existing.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException(
        'Team leads and shift planners can only update rotations in their own unit.',
      );
    }

    const parsed = UpdateOnCallRotationSchema.parse(payload);
    const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : existing.startTime;
    const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : existing.endTime;
    if (nextStartTime >= nextEndTime) {
      throw new BadRequestException('startTime must be before endTime.');
    }

    const updated = await this.prisma.onCallRotation.update({
      where: { id: existing.id },
      data: {
        startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
        rotationType: parsed.rotationType,
        note: parsed.note,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_ROTATION_UPDATED',
      entityType: 'OnCallRotation',
      entityId: updated.id,
      before: {
        startTime: existing.startTime.toISOString(),
        endTime: existing.endTime.toISOString(),
        rotationType: existing.rotationType,
      },
      after: {
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        rotationType: updated.rotationType,
      },
    });

    return updated;
  }

  async createOnCallDeployment(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsedPayload = CreateOnCallDeploymentSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException(
        parsedPayload.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const parsed = parsedPayload.data;

    assertCanActForPerson(user, actor.id, parsed.personId);

    const rotation = await this.prisma.onCallRotation.findUnique({
      where: { id: parsed.rotationId },
    });
    if (!rotation) {
      throw new BadRequestException('Referenced on-call rotation does not exist.');
    }

    if (rotation.personId !== parsed.personId) {
      throw new BadRequestException('Rotation personId does not match deployment personId.');
    }

    const deploymentStart = new Date(parsed.startTime);
    if (deploymentStart < rotation.startTime || deploymentStart > rotation.endTime) {
      throw new BadRequestException('Deployment start time must be within rotation window.');
    }

    const endTime = parsed.endTime
      ? new Date(parsed.endTime)
      : new Date(new Date(parsed.startTime).getTime() + 60 * 60 * 1000);
    if (endTime <= deploymentStart) {
      throw new BadRequestException('Deployment end time must be after start time.');
    }
    if (endTime > rotation.endTime) {
      throw new BadRequestException('Deployment end time must be within rotation window.');
    }

    const duplicate = await this.prisma.onCallDeployment.findFirst({
      where: {
        personId: parsed.personId,
        rotationId: parsed.rotationId,
        startTime: deploymentStart,
        endTime,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('An identical on-call deployment already exists.');
    }

    const deployment = await this.prisma.onCallDeployment.create({
      data: {
        personId: parsed.personId,
        rotationId: parsed.rotationId,
        startTime: new Date(parsed.startTime),
        endTime,
        remote: parsed.remote,
        ticketReference: parsed.ticketReference,
        eventReference: parsed.eventReference,
        description: parsed.description,
      },
    });

    const deploymentTimeType = await this.prisma.timeType.findFirst({
      where: { code: 'DEPLOYMENT' },
      select: { id: true },
    });

    if (deploymentTimeType) {
      await this.prisma.booking.create({
        data: {
          personId: parsed.personId,
          timeTypeId: deploymentTimeType.id,
          startTime: new Date(parsed.startTime),
          endTime,
          source: BookingSource.MANUAL,
          note: parsed.description,
        },
      });
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_DEPLOYMENT_CREATED',
      entityType: 'OnCallDeployment',
      entityId: deployment.id,
      after: {
        personId: deployment.personId,
        startTime: deployment.startTime.toISOString(),
        endTime: deployment.endTime.toISOString(),
      },
    });

    return deployment;
  }

  async onCallCompliance(
    user: AuthenticatedIdentity,
    personId?: string,
    nextShiftStart?: string,
  ): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const targetPersonId = personId ?? actor.id;

    assertCanActForPerson(user, actor.id, targetPersonId);

    if (!nextShiftStart) {
      throw new BadRequestException('nextShiftStart query parameter is required.');
    }

    const shiftStart = new Date(nextShiftStart);
    if (Number.isNaN(shiftStart.getTime())) {
      throw new BadRequestException('nextShiftStart must be a valid ISO datetime.');
    }

    const deployments = await this.prisma.onCallDeployment.findMany({
      where: {
        personId: targetPersonId,
      },
      orderBy: { endTime: 'desc' },
      take: 20,
    });

    const activeRotation = await this.prisma.onCallRotation.findFirst({
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

    return {
      personId: targetPersonId,
      rotationId: activeRotation?.id ?? null,
      ...result,
    };
  }
}
