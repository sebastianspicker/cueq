/** Supplies the group threshold and builds role-gated audit and compliance summaries. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClosingStatus } from '@cueq/database';
import { AuditSummaryQuerySchema, ComplianceSummaryQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AuditHelper } from '../audit/public.js';
import { PersonHelper, SENSITIVE_REPORT_ALLOWED_ROLES } from '../people/public.js';

const GOVERNANCE_MIN_GROUP_SIZE = 5;

/**
 * Provides the minimum-group threshold used by operational analytics and builds
 * sensitive audit/compliance summaries under explicit role checks.
 */
@Injectable()
export class ReportingComplianceHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
  ) {}

  minGroupSize(): number {
    const parsed = Math.trunc(
      Number(process.env.REPORT_MIN_GROUP_SIZE ?? GOVERNANCE_MIN_GROUP_SIZE),
    );
    return Number.isFinite(parsed) && parsed >= GOVERNANCE_MIN_GROUP_SIZE
      ? parsed
      : GOVERNANCE_MIN_GROUP_SIZE;
  }

  private assertCanReadSensitiveReports(user: AuthenticatedIdentity) {
    if (!SENSITIVE_REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit sensitive report access.');
    }
  }

  private async appendReportAccessAudit(
    actorId: string,
    report: 'audit-summary' | 'compliance-summary',
    from: string,
    to: string,
  ) {
    await this.auditHelper.appendAudit({
      actorId,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `${report}:${from}:${to}`,
      after: {
        report,
        suppressed: false,
      },
    });
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = AuditSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const where = { timestamp: { gte: from, lte: to } };
    const [entries, uniqueActors, actionGroups, entityTypeGroups] = await Promise.all([
      this.prisma.auditEntry.count({ where }),
      this.prisma.auditEntry.groupBy({
        by: ['actorId'],
        where,
      }),
      this.prisma.auditEntry.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
      }),
      this.prisma.auditEntry.groupBy({
        by: ['entityType'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byAction = actionGroups
      .map((group) => ({ action: group.action, count: group._count._all }))
      .sort((left, right) => left.action.localeCompare(right.action));
    const byEntityType = entityTypeGroups
      .map((group) => ({ entityType: group.entityType, count: group._count._all }))
      .sort((left, right) => left.entityType.localeCompare(right.entityType));
    const actionCounts = new Map(byAction.map(({ action, count }) => [action, count]));

    const reportAccesses = actionCounts.get('REPORT_ACCESSED') ?? 0;
    const exportsTriggered = actionCounts.get('CLOSING_EXPORTED') ?? 0;
    const lockBlocks = actionCounts.get('CLOSING_LOCK_BLOCKED') ?? 0;

    await this.appendReportAccessAudit(actor.id, 'audit-summary', parsed.from, parsed.to);

    return {
      from: parsed.from,
      to: parsed.to,
      totals: {
        entries,
        uniqueActors: uniqueActors.length,
        reportAccesses,
        exportsTriggered,
        lockBlocks,
      },
      byAction,
      byEntityType,
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

    await this.appendReportAccessAudit(actor.id, 'compliance-summary', parsed.from, parsed.to);

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
