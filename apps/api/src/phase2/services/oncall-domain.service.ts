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
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import { APPROVAL_ROLES, assertCanActForPerson } from '../helpers/role-constants';
import { bookingOverlapWhere } from '../helpers/booking-overlap.helper';
import { lockPersonWrites } from '../helpers/transaction-lock.helper';

type OnCallDateWindowQuery = {
  from?: string;
  to?: string;
};

type OnCallDateWindowWhere = {
  AND?: Array<{ startTime?: { lte: Date }; endTime?: { gte: Date } }>;
  startTime?: { lte: Date };
  endTime?: { gte: Date };
};

@Injectable()
export class OncallDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  private onCallDateWindowWhere(query: OnCallDateWindowQuery): OnCallDateWindowWhere {
    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be on or before to.');
    }
    if (fromDate && toDate) {
      return { AND: [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }] };
    }
    if (fromDate) {
      return { endTime: { gte: fromDate } };
    }
    if (toDate) {
      return { startTime: { lte: toDate } };
    }
    return {};
  }

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

    return this.prisma.$transaction(async (tx) => {
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

      const rotation = await tx.onCallRotation.create({
        data: {
          personId: parsed.personId,
          organizationUnitId: parsed.organizationUnitId,
          startTime: new Date(parsed.startTime),
          endTime: new Date(parsed.endTime),
          rotationType: parsed.rotationType,
          note: parsed.note,
        },
      });

      await this.auditHelper.appendAudit(
        {
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
        },
        tx,
      );

      return rotation;
    });
  }

  async listOnCallRotations(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Role does not permit reading rotations.');
    }

    const parsed = ListOnCallRotationsQuerySchema.parse(query ?? {});
    const where: Prisma.OnCallRotationWhereInput = {
      personId: parsed.personId,
      organizationUnitId: parsed.organizationUnitId,
      ...this.onCallDateWindowWhere(parsed),
    };

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
    const where: Prisma.OnCallDeploymentWhereInput = {
      personId: parsed.personId,
      rotation: parsed.organizationUnitId
        ? { organizationUnitId: parsed.organizationUnitId }
        : undefined,
      ...this.onCallDateWindowWhere(parsed),
    };

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

    const parsed = UpdateOnCallRotationSchema.parse(payload);
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [existing.personId]);
      const current = await tx.onCallRotation.findUnique({ where: { id: rotationId } });
      if (!current) {
        throw new NotFoundException('On-call rotation not found.');
      }

      if (
        (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
        current.organizationUnitId !== actor.organizationUnitId
      ) {
        throw new ForbiddenException(
          'Team leads and shift planners can only update rotations in their own unit.',
        );
      }

      const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : current.startTime;
      const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : current.endTime;
      if (nextStartTime >= nextEndTime) {
        throw new BadRequestException('startTime must be before endTime.');
      }

      const updated = await tx.onCallRotation.update({
        where: { id: current.id },
        data: {
          startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
          endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
          rotationType: parsed.rotationType,
          note: parsed.note,
        },
      });

      await this.auditHelper.appendAudit(
        {
          actorId: actor.id,
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

      return updated;
    });
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

    const closingAttempt = {
      actorId: actor.id,
      organizationUnitId: rotation.organizationUnitId,
      from: deploymentStart,
      to: endTime,
      attemptedAction: 'ONCALL_DEPLOYMENT_CREATE',
      entityType: 'OnCallDeployment',
      entityId: `${parsed.rotationId}:${parsed.personId}:${parsed.startTime}`,
    };
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

    return this.prisma
      .$transaction(async (tx) => {
        await this.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
          {
            organizationUnitId: rotation.organizationUnitId,
            from: deploymentStart,
            to: endTime,
          },
          tx,
        );
        await lockPersonWrites(tx, [parsed.personId]);

        const duplicate = await tx.onCallDeployment.findFirst({
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

        const deploymentTimeType = await tx.timeType.findFirst({
          where: { code: 'DEPLOYMENT' },
          select: { id: true },
        });

        if (deploymentTimeType) {
          const bookingOverlap = await tx.booking.findFirst({
            where: bookingOverlapWhere({
              personId: parsed.personId,
              startTime: deploymentStart,
              endTime,
            }),
          });
          if (bookingOverlap) {
            throw new ConflictException('Deployment booking overlaps with an existing booking.');
          }
        }

        const created = await tx.onCallDeployment.create({
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

        if (deploymentTimeType) {
          await tx.booking.create({
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

        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
            action: 'ONCALL_DEPLOYMENT_CREATED',
            entityType: 'OnCallDeployment',
            entityId: created.id,
            after: {
              personId: created.personId,
              startTime: created.startTime.toISOString(),
              endTime: created.endTime.toISOString(),
            },
          },
          tx,
        );

        return created;
      })
      .catch((error: unknown) =>
        this.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
      );
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
