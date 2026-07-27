/** Creates idempotent, traceable payroll export artifacts for approved periods. */
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClosingStatus, type Prisma } from '@cueq/database';
import { applyCutoffLock } from '@cueq/core';
import { ClosingExportRequestSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { AuditHelper } from './audit.helper.js';
import { toCoreClosingStatus } from './closing-lock.helper.js';
import { EventOutboxHelper } from './event-outbox.helper.js';
import { PersonHelper } from './person.helper.js';
import { EXPORT_DOWNLOAD_ROLES, HR_LIKE_ROLES } from './role-constants.js';
import { lockClosingPeriodWrites } from './transaction-lock.helper.js';
import { escapeXml, toClosingActorRole, toPersistenceClosingStatus } from './closing-utils.js';

function xmlAttribute(name: string, value: string): string {
  return [' ', name, '="', escapeXml(value), '"'].join('');
}

function payrollExportStart(format: string, closingPeriodId: string): string {
  return [
    '<payrollExport',
    xmlAttribute('format', format),
    xmlAttribute('closingPeriodId', closingPeriodId),
    '>',
  ].join('');
}

function payrollRow(row: {
  personId: string;
  targetHours: number;
  actualHours: number;
  balance: number;
}): string {
  return [
    '  <row',
    xmlAttribute('personId', row.personId),
    xmlAttribute('targetHours', row.targetHours.toFixed(2)),
    xmlAttribute('actualHours', row.actualHours.toFixed(2)),
    xmlAttribute('balance', row.balance.toFixed(2)),
    ' />',
  ].join('');
}

type ExportRow = {
  personId: string;
  targetHours: number;
  actualHours: number;
  balance: number;
};

type ExportArtifact = {
  artifact: string;
  checksum: string;
  contentType: string;
  rows: ExportRow[];
};

type ExistingExportRun = {
  id: string;
  format: string;
  checksum: string;
  artifact: string | null;
  contentType: string | null;
  recordCount: number;
};

/**
 * Produces idempotent payroll export artifacts from an approved closing period.
 * Export-run persistence and audit records make repeated requests return a stable, traceable result.
 */
@Injectable()
export class ClosingExportHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
  ) {}

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string, payload?: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can export closing periods.');
    }
    const parsedRequest = ClosingExportRequestSchema.parse(payload ?? {});
    const format = parsedRequest.format ?? 'CSV_V1';

    const actor = await this.personHelper.personForUser(user);

    return this.prisma.$transaction((tx) =>
      this.exportClosingInTransaction(tx, closingPeriodId, format, actor),
    );
  }

  private async exportClosingInTransaction(
    tx: Prisma.TransactionClient,
    closingPeriodId: string,
    format: string,
    actor: { id: string; role: AuthenticatedIdentity['role'] },
  ) {
    await lockClosingPeriodWrites(tx, closingPeriodId);
    const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) throw new NotFoundException('Closing period not found.');

    const exportArtifact = await this.buildExportArtifact(tx, period, format, closingPeriodId);
    const existingRun = await this.findExistingExportRun(
      tx,
      closingPeriodId,
      format,
      exportArtifact.checksum,
    );
    if (this.isCommittedExport(existingRun, period.status)) {
      return this.exportResponse(existingRun, exportArtifact);
    }

    const periodRequiresTransition = period.status !== ClosingStatus.EXPORTED;
    await this.transitionPeriodForExport(tx, period.status, closingPeriodId, actor.role);
    const exportRun = await this.persistExportRun(
      tx,
      existingRun,
      closingPeriodId,
      format,
      exportArtifact,
      actor.id,
    );
    if (existingRun && !periodRequiresTransition) {
      await this.auditArtifactBackfill(actor.id, existingRun, exportRun, tx);
      return this.exportResponse(exportRun, exportArtifact);
    }

    await this.auditAndPublishExport(actor.id, closingPeriodId, exportRun, tx);
    return this.exportResponse(exportRun, exportArtifact);
  }

  private async buildExportArtifact(
    tx: Prisma.TransactionClient,
    period: { organizationUnitId: string | null; periodStart: Date; periodEnd: Date },
    format: string,
    closingPeriodId: string,
  ): Promise<ExportArtifact> {
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
    const rows = accounts.map((account) => this.normalizedExportRow(account));
    const artifact =
      format === 'CSV_V1'
        ? this.csvArtifact(rows)
        : this.xmlArtifact(rows, format, closingPeriodId);
    return {
      artifact,
      checksum: createHash('sha256').update(artifact).digest('hex'),
      contentType: format === 'CSV_V1' ? 'text/csv' : 'application/xml',
      rows,
    };
  }

  private normalizedExportRow(account: {
    personId: string;
    targetHours: { toString(): string } | number;
    actualHours: { toString(): string } | number;
    balance: { toString(): string } | number;
  }): ExportRow {
    return {
      personId: account.personId,
      targetHours: Number(Number(account.targetHours).toFixed(2)),
      actualHours: Number(Number(account.actualHours).toFixed(2)),
      balance: Number(Number(account.balance).toFixed(2)),
    };
  }

  private csvArtifact(rows: ExportRow[]): string {
    const body = rows
      .map(
        (row) =>
          `${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
      )
      .join('\n');
    return `personId,targetHours,actualHours,balance\n${body}\n`;
  }

  private xmlArtifact(rows: ExportRow[], format: string, closingPeriodId: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      payrollExportStart(format, closingPeriodId),
      ...rows.map(payrollRow),
      '</payrollExport>',
      '',
    ].join('\n');
  }

  private findExistingExportRun(
    tx: Prisma.TransactionClient,
    closingPeriodId: string,
    format: string,
    checksum: string,
  ) {
    return tx.exportRun.findUnique({
      where: { closingPeriodId_format_checksum: { closingPeriodId, format, checksum } },
    });
  }

  private isCommittedExport(
    run: ExistingExportRun | null,
    status: ClosingStatus,
  ): run is ExistingExportRun {
    return Boolean(run?.artifact && run.contentType && status === ClosingStatus.EXPORTED);
  }

  private async transitionPeriodForExport(
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

  private async persistExportRun(
    tx: Prisma.TransactionClient,
    existingRun: ExistingExportRun | null,
    closingPeriodId: string,
    format: string,
    exportArtifact: ExportArtifact,
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

  private async auditArtifactBackfill(
    actorId: string,
    existingRun: ExistingExportRun,
    exportRun: ExistingExportRun,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.auditHelper.appendAudit(
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

  private async auditAndPublishExport(
    actorId: string,
    closingPeriodId: string,
    exportRun: ExistingExportRun,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.auditHelper.appendAudit(
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
    await this.eventOutboxHelper.enqueueDomainEvent(
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

  private exportResponse(run: ExistingExportRun, exportArtifact: ExportArtifact) {
    const artifact = run.artifact ?? exportArtifact.artifact;
    return {
      exportRun: run,
      checksum: run.checksum,
      csv: run.format === 'CSV_V1' ? artifact : null,
      artifact,
      contentType: run.contentType ?? exportArtifact.contentType,
      rows: exportArtifact.rows,
    };
  }

  private async loadScopedExportRun(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    runId: string,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const exportRun = await this.prisma.exportRun.findFirst({
      where: { id: runId, closingPeriodId },
    });
    if (!exportRun) throw new NotFoundException('Export run not found.');
    return { actor, exportRun };
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }
    const { actor, exportRun } = await this.loadScopedExportRun(user, closingPeriodId, runId);

    if (!exportRun.artifact || exportRun.format !== 'CSV_V1') {
      throw new BadRequestException('CSV artifact is unavailable for this export run.');
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'PAYROLL_EXPORT_DOWNLOADED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        closingPeriodId,
        checksum: exportRun.checksum,
        format: exportRun.format,
        endpoint: 'csv',
      },
    });

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.csv`,
      csv: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType: exportRun.contentType ?? 'text/csv',
    };
  }

  async getExportRunArtifact(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export artifacts.');
    }
    const { actor, exportRun } = await this.loadScopedExportRun(user, closingPeriodId, runId);
    if (!exportRun.artifact) {
      throw new BadRequestException('Artifact is unavailable for this export run.');
    }

    const extension = exportRun.format === 'XML_V1' ? 'xml' : 'csv';
    const contentType =
      exportRun.contentType ?? (exportRun.format === 'XML_V1' ? 'application/xml' : 'text/csv');

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'PAYROLL_EXPORT_DOWNLOADED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        closingPeriodId,
        checksum: exportRun.checksum,
        format: exportRun.format,
        endpoint: 'artifact',
      },
    });

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.${extension}`,
      artifact: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType,
      format: exportRun.format,
    };
  }
}
