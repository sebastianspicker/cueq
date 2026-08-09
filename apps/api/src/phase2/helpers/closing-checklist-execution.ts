/** Executes the access-controlled, transaction-safe closing checklist flow. */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { generateClosingChecklist } from '@cueq/core';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { toCoreClosingStatus } from './closing-lock.helper.js';
import {
  calculateClosingChecklistMetrics,
  type ChecklistPeriod,
  type ClosingDb,
} from './closing-checklist-metrics.js';
import type { EventOutboxHelper } from './event-outbox.helper.js';
import type { PersonHelper } from './person.helper.js';
import { CLOSING_READ_ROLES } from './role-constants.js';
import type { TimeThresholdPolicyHelper } from './time-threshold-policy.helper.js';
import { lockClosingPeriodWrites } from './transaction-lock.helper.js';

export type ClosingChecklistDependencies = {
  prisma: PrismaService;
  personHelper: Pick<PersonHelper, 'personForUser'>;
  eventOutboxHelper: Pick<EventOutboxHelper, 'enqueueDomainEvent'>;
  timeThresholdPolicyHelper: Pick<TimeThresholdPolicyHelper, 'getActiveThresholds'>;
};

export type ClosingChecklistResponse = {
  closingPeriodId: string;
  status: 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';
  hasErrors: boolean;
  items: ReturnType<typeof generateClosingChecklist>['items'];
};

export async function executeClosingChecklist(
  dependencies: ClosingChecklistDependencies,
  user: AuthenticatedIdentity,
  closingPeriodId: string,
  db: ClosingDb = dependencies.prisma,
  emitViolationEvent = true,
): Promise<ClosingChecklistResponse> {
  const actor = await dependencies.personHelper.personForUser(user);
  if (!CLOSING_READ_ROLES.has(user.role)) {
    throw new ForbiddenException('Role does not permit reading closing checklist details.');
  }

  if (db === dependencies.prisma) {
    return dependencies.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      return executeClosingChecklist(dependencies, user, closingPeriodId, tx, emitViolationEvent);
    });
  }

  const period = await findClosingPeriod(db, closingPeriodId);
  assertClosingChecklistAccess(user, actor.organizationUnitId, period);
  const metrics = await calculateClosingChecklistMetrics(db, period, () =>
    dependencies.timeThresholdPolicyHelper.getActiveThresholds(),
  );
  const checklist = generateClosingChecklist(metrics);
  await emitChecklistViolation(
    dependencies.eventOutboxHelper,
    db,
    period,
    checklist,
    emitViolationEvent,
  );

  return {
    closingPeriodId: period.id,
    status: toCoreClosingStatus(period.status),
    hasErrors: checklist.hasErrors,
    items: checklist.items,
  };
}

async function findClosingPeriod(db: ClosingDb, id: string): Promise<ChecklistPeriod> {
  const period = await db.closingPeriod.findUnique({
    where: { id },
    include: { exportRuns: true },
  });
  if (!period) throw new NotFoundException('Closing period not found.');
  return period;
}

function assertClosingChecklistAccess(
  user: AuthenticatedIdentity,
  actorOrganizationUnitId: string,
  period: ChecklistPeriod,
): void {
  if (user.role !== Role.TEAM_LEAD || period.organizationUnitId === actorOrganizationUnitId) return;

  throw new ForbiddenException('Team leads can only access closing checklist in their own unit.');
}

async function emitChecklistViolation(
  eventOutboxHelper: Pick<EventOutboxHelper, 'enqueueDomainEvent'>,
  db: ClosingDb,
  period: ChecklistPeriod,
  checklist: ReturnType<typeof generateClosingChecklist>,
  emitViolationEvent: boolean,
): Promise<void> {
  if (!emitViolationEvent || !checklist.hasErrors) return;

  const checklistCodes = checklist.items
    .filter((item) => item.severity === 'ERROR' && item.status === 'OPEN')
    .map((item) => item.code);
  if (checklistCodes.length === 0) return;

  await eventOutboxHelper.enqueueDomainEvent(
    {
      eventType: 'violation.detected',
      aggregateType: 'ClosingPeriod',
      aggregateId: period.id,
      payload: {
        checklistCodes,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
      },
    },
    db,
  );
}
