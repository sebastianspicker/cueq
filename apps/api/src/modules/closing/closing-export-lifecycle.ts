/** Executes the locked, idempotent closing-export lifecycle inside one transaction. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClosingStatus, type Prisma } from '@cueq/database';
import { applyCutoffLock } from '@cueq/domain';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { AuditHelper, EventOutboxHelper } from '../audit/public.js';
import {
  buildClosingExportArtifact,
  closingExportResponse,
  type ClosingExportArtifact,
  type ExistingClosingExportRun,
} from './closing-export-artifact.js';
import { toCoreClosingStatus } from '../../platform/transactions/closing-lock.helper.js';
import { lockClosingPeriodWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { toClosingActorRole, toPersistenceClosingStatus } from './closing-mapping.js';

type ClosingExportActor = {
  id: string;
  role: AuthenticatedIdentity['role'];
};

type ClosingExportLifecycleDependencies = {
  auditHelper: Pick<AuditHelper, 'appendAudit'>;
  eventOutboxHelper: Pick<EventOutboxHelper, 'enqueueDomainEvent'>;
};

export async function runClosingExportLifecycle(
  tx: Prisma.TransactionClient,
  closingPeriodId: string,
  format: string,
  actor: ClosingExportActor,
  dependencies: ClosingExportLifecycleDependencies,
) {
  await lockClosingPeriodWrites(tx, closingPeriodId);
  const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
  if (!period) throw new NotFoundException('Closing period not found.');

  const exportArtifact = await buildExportArtifact(tx, period, format, closingPeriodId);
  const existingRun = await findExistingExportRun(
    tx,
    closingPeriodId,
    format,
    exportArtifact.checksum,
  );
  if (isCommittedExport(existingRun, period.status)) {
    return closingExportResponse(existingRun, exportArtifact);
  }

  const periodRequiresTransition = period.status !== ClosingStatus.EXPORTED;
  await transitionPeriodForExport(tx, period.status, closingPeriodId, actor.role);
  const exportRun = await persistExportRun(
    tx,
    existingRun,
    closingPeriodId,
    format,
    exportArtifact,
    actor.id,
  );
  if (existingRun && !periodRequiresTransition) {
    await auditArtifactBackfill(dependencies.auditHelper, actor.id, existingRun, exportRun, tx);
    return closingExportResponse(exportRun, exportArtifact);
  }

  await auditAndPublishExport(dependencies, actor.id, closingPeriodId, exportRun, tx);
  return closingExportResponse(exportRun, exportArtifact);
}

async function buildExportArtifact(
  tx: Prisma.TransactionClient,
  period: { organizationUnitId: string | null; periodStart: Date; periodEnd: Date },
  format: string,
  closingPeriodId: string,
): Promise<ClosingExportArtifact> {
  const accounts = await tx.timeAccount.findMany({
    where: {
      person: period.organizationUnitId
        ? { organizationUnitId: period.organizationUnitId }
        : undefined,
      periodStart: { gte: period.periodStart },
      periodEnd: { lte: period.periodEnd },
    },
    orderBy: { personId: 'asc' },
  });
  return buildClosingExportArtifact(accounts, format, closingPeriodId);
}

function findExistingExportRun(
  tx: Prisma.TransactionClient,
  closingPeriodId: string,
  format: string,
  checksum: string,
) {
  return tx.exportRun.findUnique({
    where: { closingPeriodId_format_checksum: { closingPeriodId, format, checksum } },
  });
}

function isCommittedExport(
  run: ExistingClosingExportRun | null,
  status: ClosingStatus,
): run is ExistingClosingExportRun {
  return Boolean(run?.artifact && run.contentType && status === ClosingStatus.EXPORTED);
}

async function transitionPeriodForExport(
  tx: Prisma.TransactionClient,
  currentStatus: ClosingStatus,
  closingPeriodId: string,
  actorRole: AuthenticatedIdentity['role'],
): Promise<void> {
  if (currentStatus === ClosingStatus.EXPORTED) return;

  const transition = applyCutoffLock({
    currentStatus: toCoreClosingStatus(currentStatus),
    action: 'EXPORT',
    actorRole: toClosingActorRole(actorRole),
    checklistHasErrors: false,
  });
  if (transition.violations.length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: transition.violations.join('; '),
      details: transition.violations,
    });
  }
  await tx.closingPeriod.update({
    where: { id: closingPeriodId },
    data: { status: toPersistenceClosingStatus(transition.nextStatus) },
  });
}

function persistExportRun(
  tx: Prisma.TransactionClient,
  existingRun: ExistingClosingExportRun | null,
  closingPeriodId: string,
  format: string,
  exportArtifact: ClosingExportArtifact,
  actorId: string,
) {
  if (!existingRun) {
    return tx.exportRun.create({
      data: {
        closingPeriodId,
        format,
        recordCount: exportArtifact.rows.length,
        checksum: exportArtifact.checksum,
        artifact: exportArtifact.artifact,
        contentType: exportArtifact.contentType,
        exportedById: actorId,
      },
    });
  }
  if (existingRun.artifact && existingRun.contentType) return existingRun;

  return tx.exportRun.update({
    where: { id: existingRun.id },
    data: {
      artifact: existingRun.artifact ?? exportArtifact.artifact,
      contentType: existingRun.contentType ?? exportArtifact.contentType,
    },
  });
}

async function auditArtifactBackfill(
  auditHelper: Pick<AuditHelper, 'appendAudit'>,
  actorId: string,
  existingRun: ExistingClosingExportRun,
  exportRun: ExistingClosingExportRun,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'EXPORT_ARTIFACT_BACKFILLED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      before: {
        artifactAvailable: Boolean(existingRun.artifact),
        contentType: existingRun.contentType,
      },
      after: {
        artifactAvailable: Boolean(exportRun.artifact),
        contentType: exportRun.contentType,
      },
    },
    tx,
  );
}

async function auditAndPublishExport(
  dependencies: ClosingExportLifecycleDependencies,
  actorId: string,
  closingPeriodId: string,
  exportRun: ExistingClosingExportRun,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await dependencies.auditHelper.appendAudit(
    {
      actorId,
      action: 'CLOSING_EXPORTED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        checksum: exportRun.checksum,
        recordCount: exportRun.recordCount,
        format: exportRun.format,
      },
    },
    tx,
  );
  await dependencies.eventOutboxHelper.enqueueDomainEvent(
    {
      eventType: 'export.ready',
      aggregateType: 'ExportRun',
      aggregateId: exportRun.id,
      payload: {
        closingPeriodId,
        format: exportRun.format,
        recordCount: exportRun.recordCount,
        checksum: exportRun.checksum,
      },
    },
    tx,
  );
}
