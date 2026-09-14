import { nativeAuditVisibilitySql } from '../../application/audit/native-audit-visibility.js';
/** Supplies the group threshold and builds role-gated audit and compliance summaries. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ClosingStatus } from '@cueq/database';
import { AuditSummaryQuerySchema, ComplianceSummaryQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AuditHelper } from '../audit/public.js';
import { PersonHelper, SENSITIVE_REPORT_ALLOWED_ROLES } from '../people/public.js';
import {
  closingCompletionTotalsFromGroups,
  databaseNumber,
} from './reporting-analytics-aggregation.helper.js';

import { reportingPrivacyThreshold } from '../../application/reporting/privacy-threshold.js';

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
    return reportingPrivacyThreshold();
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

    const [summaryRows, actionGroups, entityTypeGroups] = await Promise.all([
      this.prisma.$queryRaw<Array<{ entries: number | bigint; uniqueActors: number | bigint }>>`
        SELECT COUNT(*)::integer AS "entries",
               COUNT(DISTINCT "actorId")::integer AS "uniqueActors"
        FROM "audit_entries"
        WHERE "timestamp" >= ${from} AND "timestamp" <= ${to} AND ${nativeAuditVisibilitySql(actor.id)}
      `,
      this.prisma.$queryRaw<Array<{ action: string; count: number | bigint }>>`
        SELECT "action", COUNT(*)::integer AS "count"
        FROM "audit_entries"
        WHERE "timestamp" >= ${from} AND "timestamp" <= ${to} AND ${nativeAuditVisibilitySql(actor.id)}
        GROUP BY "action"
        ORDER BY "action" ASC
      `,
      this.prisma.$queryRaw<Array<{ entityType: string; count: number | bigint }>>`
        SELECT "entityType", COUNT(*)::integer AS "count"
        FROM "audit_entries"
        WHERE "timestamp" >= ${from} AND "timestamp" <= ${to} AND ${nativeAuditVisibilitySql(actor.id)}
        GROUP BY "entityType"
        ORDER BY "entityType" ASC
      `,
    ]);

    const byAction = actionGroups.map((group) => ({
      action: group.action,
      count: databaseNumber(group.count),
    }));
    const byEntityType = entityTypeGroups.map((group) => ({
      entityType: group.entityType,
      count: databaseNumber(group.count),
    }));
    const actionCounts = new Map(byAction.map(({ action, count }) => [action, count]));
    const summary = summaryRows[0];

    const reportAccesses = actionCounts.get('REPORT_ACCESSED') ?? 0;
    const exportsTriggered = actionCounts.get('CLOSING_EXPORTED') ?? 0;
    const lockBlocks = actionCounts.get('CLOSING_LOCK_BLOCKED') ?? 0;

    await this.appendReportAccessAudit(actor.id, 'audit-summary', parsed.from, parsed.to);

    return {
      from: parsed.from,
      to: parsed.to,
      totals: {
        entries: databaseNumber(summary?.entries),
        uniqueActors: databaseNumber(summary?.uniqueActors),
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

    const [auditRows, periodGroups, exportRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          reportAccesses: number | bigint;
          suppressedReportAccesses: number | bigint;
          lockBlocks: number | bigint;
          postCloseCorrections: number | bigint;
          lastBackupRestoreVerifiedAt: Date | null;
        }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE "action" = 'REPORT_ACCESSED')::integer AS "reportAccesses",
          COUNT(*) FILTER (
            WHERE "action" = 'REPORT_ACCESSED'
              AND "after" @> '{"suppressed": true}'::jsonb
          )::integer AS "suppressedReportAccesses",
          COUNT(*) FILTER (WHERE "action" = 'CLOSING_LOCK_BLOCKED')::integer AS "lockBlocks",
          COUNT(*) FILTER (
            WHERE "action" = 'POST_CLOSE_CORRECTION_APPLIED'
          )::integer AS "postCloseCorrections",
          MAX("timestamp") FILTER (
            WHERE "action" = 'BACKUP_RESTORE_VERIFIED'
          ) AS "lastBackupRestoreVerifiedAt"
        FROM "audit_entries"
        WHERE "timestamp" >= ${from} AND "timestamp" <= ${to} AND ${nativeAuditVisibilitySql(actor.id)}
      `,
      this.prisma.$queryRaw<Array<{ status: ClosingStatus; count: number | bigint }>>`
        SELECT "status"::text AS "status", COUNT(*)::integer AS "count"
        FROM "closing_periods"
        WHERE "periodStart" <= ${to} AND "periodEnd" >= ${from}
        GROUP BY "status"
        ORDER BY "status" ASC
      `,
      this.prisma.$queryRaw<
        Array<{
          runs: number | bigint;
          uniqueChecksums: number | bigint;
          lastRunAt: Date | null;
        }>
      >`
        SELECT COUNT(*)::integer AS "runs",
               COUNT(DISTINCT "checksum")::integer AS "uniqueChecksums",
               MAX("exportedAt") AS "lastRunAt"
        FROM "export_runs"
        WHERE "exportedAt" >= ${from} AND "exportedAt" <= ${to}
      `,
    ]);

    const audit = auditRows[0];
    const reportAccesses = databaseNumber(audit?.reportAccesses);
    const suppressedReportAccesses = databaseNumber(audit?.suppressedReportAccesses);
    const suppressionRate =
      reportAccesses === 0 ? 0 : Number((suppressedReportAccesses / reportAccesses).toFixed(4));

    const closingTotals = closingCompletionTotalsFromGroups(periodGroups);
    const runs = databaseNumber(exportRows[0]?.runs);
    const uniqueChecksums = databaseNumber(exportRows[0]?.uniqueChecksums);
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
        periods: closingTotals.periods,
        exported: closingTotals.exported,
        completionRate: closingTotals.completionRate,
        lockBlocks: databaseNumber(audit?.lockBlocks),
        postCloseCorrections: databaseNumber(audit?.postCloseCorrections),
      },
      payrollExport: {
        runs,
        uniqueChecksums,
        duplicateChecksums,
        lastRunAt: exportRows[0]?.lastRunAt?.toISOString() ?? null,
      },
      operations: {
        lastBackupRestoreVerifiedAt: audit?.lastBackupRestoreVerifiedAt?.toISOString() ?? null,
      },
    };
  }
}
