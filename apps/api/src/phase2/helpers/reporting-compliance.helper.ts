import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClosingStatus } from '@cueq/database';
import { AuditSummaryQuerySchema, ComplianceSummaryQuerySchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from './audit.helper';
import { PersonHelper } from './person.helper';
import { SENSITIVE_REPORT_ALLOWED_ROLES } from './role-constants';

@Injectable()
export class ReportingComplianceHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
  ) {}

  minGroupSize(): number {
    const parsed = Number(process.env.REPORT_MIN_GROUP_SIZE ?? '5');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5;
  }

  private assertCanReadSensitiveReports(user: AuthenticatedIdentity) {
    if (!SENSITIVE_REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit sensitive report access.');
    }
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = AuditSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const entries = await this.prisma.auditEntry.findMany({
      where: {
        timestamp: { gte: from, lte: to },
      },
      select: {
        actorId: true,
        action: true,
        entityType: true,
      },
    });

    const uniqueActors = new Set<string>();
    const byAction = new Map<string, number>();
    const byEntityType = new Map<string, number>();

    for (const entry of entries) {
      uniqueActors.add(entry.actorId);
      byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);
      byEntityType.set(entry.entityType, (byEntityType.get(entry.entityType) ?? 0) + 1);
    }

    const reportAccesses = byAction.get('REPORT_ACCESSED') ?? 0;
    const exportsTriggered = byAction.get('CLOSING_EXPORTED') ?? 0;
    const lockBlocks = byAction.get('CLOSING_LOCK_BLOCKED') ?? 0;

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `audit-summary:${parsed.from}:${parsed.to}`,
      after: {
        report: 'audit-summary',
        suppressed: false,
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      totals: {
        entries: entries.length,
        uniqueActors: uniqueActors.size,
        reportAccesses,
        exportsTriggered,
        lockBlocks,
      },
      byAction: [...byAction.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((left, right) => left.action.localeCompare(right.action)),
      byEntityType: [...byEntityType.entries()]
        .map(([entityType, count]) => ({ entityType, count }))
        .sort((left, right) => left.entityType.localeCompare(right.entityType)),
    };
  }

  async reportComplianceSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = ComplianceSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const [reportAccessEntries, lockBlocks, postCloseCorrections, periods, exportRuns, backupRun] =
      await Promise.all([
        this.prisma.auditEntry.findMany({
          where: {
            action: 'REPORT_ACCESSED',
            timestamp: { gte: from, lte: to },
          },
          select: { after: true },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'CLOSING_LOCK_BLOCKED',
            timestamp: { gte: from, lte: to },
          },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'POST_CLOSE_CORRECTION_APPLIED',
            timestamp: { gte: from, lte: to },
          },
        }),
        this.prisma.closingPeriod.findMany({
          where: {
            periodStart: { lte: to },
            periodEnd: { gte: from },
          },
          select: { status: true },
        }),
        this.prisma.exportRun.findMany({
          where: {
            exportedAt: { gte: from, lte: to },
          },
          orderBy: { exportedAt: 'desc' },
          select: { checksum: true, exportedAt: true },
        }),
        this.prisma.auditEntry.findFirst({
          where: {
            action: 'BACKUP_RESTORE_VERIFIED',
            timestamp: { gte: from, lte: to },
          },
          orderBy: { timestamp: 'desc' },
        }),
      ]);

    const reportAccesses = reportAccessEntries.length;
    const suppressedReportAccesses = reportAccessEntries.reduce((total, entry) => {
      if (
        entry.after &&
        typeof entry.after === 'object' &&
        !Array.isArray(entry.after) &&
        (entry.after as Record<string, unknown>).suppressed === true
      ) {
        return total + 1;
      }
      return total;
    }, 0);
    const suppressionRate =
      reportAccesses === 0 ? 0 : Number((suppressedReportAccesses / reportAccesses).toFixed(4));

    const periodsTotal = periods.length;
    const periodsExported = periods.filter(
      (period) => period.status === ClosingStatus.EXPORTED,
    ).length;
    const completionRate =
      periodsTotal === 0 ? 0 : Number((periodsExported / periodsTotal).toFixed(4));

    const runs = exportRuns.length;
    const uniqueChecksums = new Set(exportRuns.map((run) => run.checksum)).size;
    const duplicateChecksums = runs - uniqueChecksums;

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `compliance-summary:${parsed.from}:${parsed.to}`,
      after: {
        report: 'compliance-summary',
        suppressed: false,
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      privacy: {
        minGroupSize: this.minGroupSize(),
        reportAccesses,
        suppressedReportAccesses,
        suppressionRate,
      },
      closing: {
        periods: periodsTotal,
        exported: periodsExported,
        completionRate,
        lockBlocks,
        postCloseCorrections,
      },
      payrollExport: {
        runs,
        uniqueChecksums,
        duplicateChecksums,
        lastRunAt: exportRuns[0]?.exportedAt.toISOString() ?? null,
      },
      operations: {
        lastBackupRestoreVerifiedAt: backupRun?.timestamp.toISOString() ?? null,
      },
    };
  }
}
