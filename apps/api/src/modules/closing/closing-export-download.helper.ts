/** Loads and audits payroll export downloads with their authorization order kept explicit. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import { EXPORT_DOWNLOAD_ROLES, type PersonHelper } from '../people/public.js';

type DownloadDependencies = {
  prisma: Pick<PrismaService, 'exportRun'>;
  personHelper: Pick<PersonHelper, 'personForUser'>;
  auditHelper: Pick<AuditHelper, 'appendAudit'>;
};

export class ClosingExportDownloadHelper {
  constructor(private readonly dependencies: DownloadDependencies) {}

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }
    const { actor, exportRun } = await this.loadScopedExportRun(user, closingPeriodId, runId);

    if (!exportRun.artifact || exportRun.format !== 'CSV_V1') {
      throw new BadRequestException('CSV artifact is unavailable for this export run.');
    }

    await this.appendDownloadAudit(actor.id, exportRun, closingPeriodId, 'csv');

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

    await this.appendDownloadAudit(actor.id, exportRun, closingPeriodId, 'artifact');

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.${extension}`,
      artifact: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType,
      format: exportRun.format,
    };
  }

  private async loadScopedExportRun(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    runId: string,
  ) {
    const actor = await this.dependencies.personHelper.personForUser(user);
    const exportRun = await this.dependencies.prisma.exportRun.findFirst({
      where: { id: runId, closingPeriodId },
    });
    if (!exportRun) throw new NotFoundException('Export run not found.');
    return { actor, exportRun };
  }

  private async appendDownloadAudit(
    actorId: string,
    exportRun: {
      id: string;
      checksum: string;
      format: string;
    },
    closingPeriodId: string,
    endpoint: 'csv' | 'artifact',
  ): Promise<void> {
    await this.dependencies.auditHelper.appendAudit({
      actorId,
      action: 'PAYROLL_EXPORT_DOWNLOADED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        closingPeriodId,
        checksum: exportRun.checksum,
        format: exportRun.format,
        endpoint,
      },
    });
  }
}
