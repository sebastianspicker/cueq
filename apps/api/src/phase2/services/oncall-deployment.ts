import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingSource, type Prisma } from '@cueq/database';
import type { CreateOnCallDeployment } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../helpers/audit.helper.js';
import { bookingOverlapWhere } from '../helpers/booking-overlap.helper.js';
import type {
  ClosingBlockedAttemptInput,
  ClosingLockHelper,
} from '../helpers/closing-lock.helper.js';
import { assertCanActForPerson } from '../helpers/role-constants.js';
import { lockPersonWrites } from '../helpers/transaction-lock.helper.js';

type RotationWindow = {
  personId: string;
  organizationUnitId: string | null;
  startTime: Date;
  endTime: Date;
};

type OnCallDeploymentDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  closingLockHelper: ClosingLockHelper;
};

type DeploymentContext = OnCallDeploymentDependencies & {
  user: AuthenticatedIdentity;
  actorId: string;
};

function assertRotationMatchesDeployment(
  rotation: RotationWindow | null,
  personId: string,
): asserts rotation is RotationWindow {
  if (!rotation) {
    throw new BadRequestException('Referenced on-call rotation does not exist.');
  }
  if (rotation.personId !== personId) {
    throw new BadRequestException('Rotation personId does not match deployment personId.');
  }
}

function deploymentEndTime(parsed: CreateOnCallDeployment, deploymentStart: Date): Date {
  const endTime = parsed.endTime
    ? new Date(parsed.endTime)
    : new Date(new Date(parsed.startTime).getTime() + 60 * 60 * 1000);
  if (endTime <= deploymentStart) {
    throw new BadRequestException('Deployment end time must be after start time.');
  }
  return endTime;
}

function assertDeploymentStartWithinRotation(
  rotation: RotationWindow,
  deploymentStart: Date,
): void {
  if (deploymentStart < rotation.startTime || deploymentStart > rotation.endTime) {
    throw new BadRequestException('Deployment start time must be within rotation window.');
  }
}

function assertDeploymentEndWithinRotation(rotation: RotationWindow, endTime: Date): void {
  if (endTime > rotation.endTime) {
    throw new BadRequestException('Deployment end time must be within rotation window.');
  }
}

function closingAttemptForDeployment(
  actorId: string,
  rotation: RotationWindow,
  parsed: CreateOnCallDeployment,
  deploymentStart: Date,
  endTime: Date,
): ClosingBlockedAttemptInput {
  return {
    actorId,
    organizationUnitId: rotation.organizationUnitId,
    from: deploymentStart,
    to: endTime,
    attemptedAction: 'ONCALL_DEPLOYMENT_CREATE',
    entityType: 'OnCallDeployment',
    entityId: `${parsed.rotationId}:${parsed.personId}:${parsed.startTime}`,
  };
}

async function findRotationForDeployment(
  db: Pick<PrismaService, 'onCallRotation'> | Pick<Prisma.TransactionClient, 'onCallRotation'>,
  parsed: CreateOnCallDeployment,
): Promise<RotationWindow> {
  const rotation = await db.onCallRotation.findUnique({ where: { id: parsed.rotationId } });
  assertRotationMatchesDeployment(rotation, parsed.personId);
  return rotation;
}

async function assertNoDuplicateDeployment(
  tx: Prisma.TransactionClient,
  parsed: CreateOnCallDeployment,
  deploymentStart: Date,
  endTime: Date,
): Promise<void> {
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
}

async function findDeploymentTimeType(tx: Prisma.TransactionClient) {
  return tx.timeType.findFirst({
    where: { code: 'DEPLOYMENT' },
    select: { id: true },
  });
}

async function assertDeploymentBookingDoesNotOverlap(
  tx: Prisma.TransactionClient,
  parsed: CreateOnCallDeployment,
  deploymentStart: Date,
  endTime: Date,
): Promise<void> {
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

async function createDeployment(
  tx: Prisma.TransactionClient,
  parsed: CreateOnCallDeployment,
  endTime: Date,
) {
  return tx.onCallDeployment.create({
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
}

async function createDeploymentBooking(
  tx: Prisma.TransactionClient,
  parsed: CreateOnCallDeployment,
  timeTypeId: string,
  endTime: Date,
): Promise<void> {
  await tx.booking.create({
    data: {
      personId: parsed.personId,
      timeTypeId,
      startTime: new Date(parsed.startTime),
      endTime,
      source: BookingSource.MANUAL,
      note: parsed.description,
    },
  });
}

async function appendDeploymentCreatedAudit(
  auditHelper: AuditHelper,
  actorId: string,
  created: { id: string; personId: string; startTime: Date; endTime: Date },
  tx: Prisma.TransactionClient,
): Promise<void> {
  await auditHelper.appendAudit(
    {
      actorId,
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
}

export async function createOnCallDeployment(
  context: DeploymentContext,
  parsed: CreateOnCallDeployment,
): Promise<unknown> {
  assertCanActForPerson(context.user, context.actorId, parsed.personId);
  const deploymentStart = new Date(parsed.startTime);
  const rotation = await findRotationForDeployment(context.prisma, parsed);
  assertDeploymentStartWithinRotation(rotation, deploymentStart);
  const endTime = deploymentEndTime(parsed, deploymentStart);
  assertDeploymentEndWithinRotation(rotation, endTime);
  const closingAttempt = closingAttemptForDeployment(
    context.actorId,
    rotation,
    parsed,
    deploymentStart,
    endTime,
  );
  await context.closingLockHelper.assertClosingPeriodUnlockedForRange(closingAttempt);

  return context.prisma
    .$transaction(async (tx) => {
      await context.closingLockHelper.assertClosingPeriodUnlockedForRangeInTransaction(
        {
          organizationUnitId: rotation.organizationUnitId,
          from: deploymentStart,
          to: endTime,
        },
        tx,
      );
      await lockPersonWrites(tx, [parsed.personId]);
      const currentRotation = await findRotationForDeployment(tx, parsed);
      assertDeploymentStartWithinRotation(currentRotation, deploymentStart);
      assertDeploymentEndWithinRotation(currentRotation, endTime);
      await assertNoDuplicateDeployment(tx, parsed, deploymentStart, endTime);

      const deploymentTimeType = await findDeploymentTimeType(tx);
      if (deploymentTimeType) {
        await assertDeploymentBookingDoesNotOverlap(tx, parsed, deploymentStart, endTime);
      }

      const created = await createDeployment(tx, parsed, endTime);

      if (deploymentTimeType) {
        await createDeploymentBooking(tx, parsed, deploymentTimeType.id, endTime);
      }

      await appendDeploymentCreatedAudit(context.auditHelper, context.actorId, created, tx);

      return created;
    })
    .catch((error: unknown) =>
      context.closingLockHelper.rethrowWithDurableClosingAudit(error, closingAttempt),
    );
}
