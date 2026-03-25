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
import { escapeXml, toClosingActorRole, toPersistenceClosingStatus } from './closing-utils';

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
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const accounts = await this.prisma.timeAccount.findMany({
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
      `<payrollExport format="${format}" closingPeriodId="${escapeXml(closingPeriodId)}">`,
      ...normalizedRows.map(
        (row) =>
          `  <row personId="${escapeXml(row.personId)}" targetHours="${row.targetHours.toFixed(2)}" actualHours="${row.actualHours.toFixed(2)}" balance="${row.balance.toFixed(2)}" />`,
      ),
      '</payrollExport>',
      '',
    ].join('\n');
    const artifact = format === 'CSV_V1' ? csv : xml;
    const contentType = format === 'CSV_V1' ? 'text/csv' : 'application/xml';
    const checksum = createHash('sha256').update(artifact).digest('hex');

    const existingRun = await this.prisma.exportRun.findFirst({
      where: {
        closingPeriodId,
        format,
        checksum,
      },
      orderBy: { exportedAt: 'desc' },
    });

    if (
      existingRun?.artifact &&
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

      await this.prisma.closingPeriod.update({
        where: { id: closingPeriodId },
        data: {
          status: toPersistenceClosingStatus(transition.nextStatus),
        },
      });
    }

    const exportRun = await this.prisma.exportRun.create({
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

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_EXPORTED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        checksum,
        recordCount: exportRun.recordCount,
        format: exportRun.format,
      },
    });

    await this.eventOutboxHelper.enqueueDomainEvent({
      eventType: 'export.ready',
      aggregateType: 'ExportRun',
      aggregateId: exportRun.id,
      payload: {
        closingPeriodId,
        format: exportRun.format,
        recordCount: exportRun.recordCount,
        checksum: exportRun.checksum,
      },
    });

    return {
      exportRun,
      checksum,
      csv: format === 'CSV_V1' ? artifact : null,
      artifact,
      contentType,
      rows: normalizedRows,
    };
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }

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

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.${extension}`,
      artifact: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType,
      format: exportRun.format,
    };
  }
}
