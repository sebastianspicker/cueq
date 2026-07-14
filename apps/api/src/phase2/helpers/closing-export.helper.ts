import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClosingStatus } from '@cueq/database';
import { applyCutoffLock } from '@cueq/core';
import { ClosingExportRequestSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from './audit.helper';
import { toCoreClosingStatus } from './closing-lock.helper';
import { EventOutboxHelper } from './event-outbox.helper';
import { PersonHelper } from './person.helper';
import { EXPORT_DOWNLOAD_ROLES, HR_LIKE_ROLES } from './role-constants';
import { lockClosingPeriodWrites } from './transaction-lock.helper';
import { escapeXml, toClosingActorRole, toPersistenceClosingStatus } from './closing-utils';

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

    return this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);

      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) {
        throw new NotFoundException('Closing period not found.');
      }

      const accounts = await tx.timeAccount.findMany({
        where: {
          person: period.organizationUnitId
            ? {
                organizationUnitId: period.organizationUnitId,
              }
            : undefined,
          periodStart: { gte: period.periodStart },
          periodEnd: { lte: period.periodEnd },
        },
        orderBy: { personId: 'asc' },
      });

      const normalizedRows = accounts.map((account) => ({
        personId: account.personId,
        targetHours: Number(Number(account.targetHours).toFixed(2)),
        actualHours: Number(Number(account.actualHours).toFixed(2)),
        balance: Number(Number(account.balance).toFixed(2)),
      }));

      const header = 'personId,targetHours,actualHours,balance';
      const body = normalizedRows
        .map(
          (row) =>
            `${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
        )
        .join('\n');
      const csv = `${header}\n${body}\n`;
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        payrollExportStart(format, closingPeriodId),
        ...normalizedRows.map(payrollRow),
        '</payrollExport>',
        '',
      ].join('\n');
      const artifact = format === 'CSV_V1' ? csv : xml;
      const contentType = format === 'CSV_V1' ? 'text/csv' : 'application/xml';
      const checksum = createHash('sha256').update(artifact).digest('hex');

      const existingRun = await tx.exportRun.findUnique({
        where: {
          closingPeriodId_format_checksum: {
            closingPeriodId,
            format,
            checksum,
          },
        },
      });

      if (
        existingRun?.artifact &&
        existingRun.contentType &&
        period.status === ClosingStatus.EXPORTED
      ) {
        return {
          exportRun: existingRun,
          checksum: existingRun.checksum,
          csv: existingRun.format === 'CSV_V1' ? existingRun.artifact : null,
          artifact: existingRun.artifact,
          contentType: existingRun.contentType ?? contentType,
          rows: normalizedRows,
        };
      }

      const periodRequiresTransition = period.status !== ClosingStatus.EXPORTED;
      if (period.status !== ClosingStatus.EXPORTED) {
        const transition = applyCutoffLock({
          currentStatus: toCoreClosingStatus(period.status),
          action: 'EXPORT',
          actorRole: toClosingActorRole(actor.role),
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
          data: {
            status: toPersistenceClosingStatus(transition.nextStatus),
          },
        });
      }

      const exportRun = existingRun
        ? existingRun.artifact && existingRun.contentType
          ? existingRun
          : await tx.exportRun.update({
              where: { id: existingRun.id },
              data: {
                artifact: existingRun.artifact ?? artifact,
                contentType: existingRun.contentType ?? contentType,
              },
            })
        : await tx.exportRun.create({
            data: {
              closingPeriodId,
              format,
              recordCount: normalizedRows.length,
              checksum,
              artifact,
              contentType,
              exportedById: actor.id,
            },
          });

      if (existingRun && !periodRequiresTransition) {
        await this.auditHelper.appendAudit(
          {
            actorId: actor.id,
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

        return {
          exportRun,
          checksum: exportRun.checksum,
          csv: exportRun.format === 'CSV_V1' ? exportRun.artifact : null,
          artifact: exportRun.artifact ?? artifact,
          contentType: exportRun.contentType ?? contentType,
          rows: normalizedRows,
        };
      }

      await this.auditHelper.appendAudit(
        {
          actorId: actor.id,
          action: 'CLOSING_EXPORTED',
          entityType: 'ExportRun',
          entityId: exportRun.id,
          after: {
            checksum,
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

      return {
        exportRun,
        checksum: exportRun.checksum,
        csv: exportRun.format === 'CSV_V1' ? (exportRun.artifact ?? artifact) : null,
        artifact: exportRun.artifact ?? artifact,
        contentType: exportRun.contentType ?? contentType,
        rows: normalizedRows,
      };
    });
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }
    const actor = await this.personHelper.personForUser(user);

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });

    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }

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
    const actor = await this.personHelper.personForUser(user);

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });
    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }
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
