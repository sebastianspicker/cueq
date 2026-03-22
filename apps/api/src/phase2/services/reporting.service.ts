import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClosingStatus, Role } from '@cueq/database';
import {
  AuditSummaryQuerySchema,
  ClosingCompletionQuerySchema,
  ComplianceSummaryQuerySchema,
  CustomReportOptionsSchema,
  CustomReportPreviewQuerySchema,
  OeOvertimeQuerySchema,
  TeamAbsenceQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from '../helpers/audit.helper';
import { PersonHelper } from '../helpers/person.helper';
import { REPORT_ALLOWED_ROLES, SENSITIVE_REPORT_ALLOWED_ROLES } from '../helpers/role-constants';

const METRIC_ALLOW_LIST: Record<string, Set<string>> = {
  TEAM_ABSENCE: new Set(['requests', 'days']),
  OE_OVERTIME: new Set(['people', 'totalOvertimeHours']),
  CLOSING_COMPLETION: new Set(['completionRate', 'exported']),
};

@Injectable()
export class ReportingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
  ) {}

  private minGroupSize(): number {
    const parsed = Number(process.env.REPORT_MIN_GROUP_SIZE ?? '5');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5;
  }

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }

  private assertCanReadSensitiveReports(user: AuthenticatedIdentity) {
    if (!SENSITIVE_REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit sensitive report access.');
    }
  }

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = TeamAbsenceQuerySchema.parse(query ?? {});
    const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

    if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access reports for their own unit.');
    }

    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);

    const population = await this.prisma.person.count({
      where: {
        organizationUnitId: targetOuId,
        role: { in: [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER] },
      },
    });
    const minGroupSize = this.minGroupSize();
    const suppressed = population < minGroupSize;

    let totals = { requests: 0, days: 0 };
    let buckets: Array<{ type: string; requests: number; days: number }> = [];

    if (!suppressed) {
      const absences = await this.prisma.absence.findMany({
        where: {
          person: { organizationUnitId: targetOuId },
          startDate: { lte: to },
          endDate: { gte: from },
        },
      });

      const byType = new Map<string, { requests: number; days: number }>();
      for (const absence of absences) {
        const type = absence.type;
        const current = byType.get(type) ?? { requests: 0, days: 0 };
        current.requests += 1;
        current.days += Number(absence.days);
        byType.set(type, current);
      }

      totals = {
        requests: absences.length,
        days: Number(absences.reduce((sum, absence) => sum + Number(absence.days), 0).toFixed(2)),
      };
      buckets = [...byType.entries()].map(([type, value]) => ({
        type,
        requests: value.requests,
        days: Number(value.days.toFixed(2)),
      }));
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `team-absence:${targetOuId}:${parsed.from}:${parsed.to}`,
      after: {
        report: 'team-absence',
        organizationUnitId: targetOuId,
        suppressed,
      },
    });

    return {
      organizationUnitId: targetOuId,
      from: parsed.from,
      to: parsed.to,
      suppression: {
        suppressed,
        minGroupSize,
        population,
      },
      totals,
      buckets,
    };
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = OeOvertimeQuerySchema.parse(query ?? {});
    const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

    if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access reports for their own unit.');
    }

    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);
    const minGroupSize = this.minGroupSize();

    const accounts = await this.prisma.timeAccount.findMany({
      where: {
        person: { organizationUnitId: targetOuId },
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      select: { personId: true, balance: true, overtimeHours: true },
    });

    const distinctPeople = new Set(accounts.map((account) => account.personId));
    const population = distinctPeople.size;
    const suppressed = population < minGroupSize;

    const totalBalanceHours = suppressed
      ? 0
      : Number(accounts.reduce((sum, account) => sum + Number(account.balance), 0).toFixed(2));
    const totalOvertimeHours = suppressed
      ? 0
      : Number(
          accounts.reduce((sum, account) => sum + Number(account.overtimeHours), 0).toFixed(2),
        );

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `oe-overtime:${targetOuId}:${parsed.from}:${parsed.to}`,
      after: {
        report: 'oe-overtime',
        organizationUnitId: targetOuId,
        suppressed,
      },
    });

    return {
      organizationUnitId: targetOuId,
      from: parsed.from,
      to: parsed.to,
      suppression: {
        suppressed,
        minGroupSize,
        population,
      },
      totals: {
        people: suppressed ? 0 : population,
        totalBalanceHours,
        totalOvertimeHours,
        avgBalanceHours:
          suppressed || population === 0 ? 0 : Number((totalBalanceHours / population).toFixed(2)),
      },
    };
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = ClosingCompletionQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);

    const periods = await this.prisma.closingPeriod.findMany({
      where: {
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      select: { status: true },
    });

    const totals = {
      periods: periods.length,
      exported: periods.filter((period) => period.status === ClosingStatus.EXPORTED).length,
      approved: periods.filter((period) => period.status === ClosingStatus.CLOSED).length,
      review: periods.filter((period) => period.status === ClosingStatus.REVIEW).length,
      open: periods.filter((period) => period.status === ClosingStatus.OPEN).length,
      completionRate:
        periods.length === 0
          ? 0
          : Number(
              (
                periods.filter((period) => period.status === ClosingStatus.EXPORTED).length /
                periods.length
              ).toFixed(4),
            ),
    };

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `closing-completion:${parsed.from}:${parsed.to}`,
      after: {
        report: 'closing-completion',
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      totals,
    };
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = AuditSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const entries = await this.prisma.auditEntry.findMany({
      where: {
        timestamp: {
          gte: from,
          lte: to,
        },
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
            timestamp: {
              gte: from,
              lte: to,
            },
          },
          select: {
            after: true,
          },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'CLOSING_LOCK_BLOCKED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'POST_CLOSE_CORRECTION_APPLIED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
        }),
        this.prisma.closingPeriod.findMany({
          where: {
            periodStart: { lte: to },
            periodEnd: { gte: from },
          },
          select: {
            status: true,
          },
        }),
        this.prisma.exportRun.findMany({
          where: {
            exportedAt: {
              gte: from,
              lte: to,
            },
          },
          orderBy: {
            exportedAt: 'desc',
          },
          select: {
            checksum: true,
            exportedAt: true,
          },
        }),
        this.prisma.auditEntry.findFirst({
          where: {
            action: 'BACKUP_RESTORE_VERIFIED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
          orderBy: {
            timestamp: 'desc',
          },
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

  reportCustomOptions(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit access to reports.');
    }

    return CustomReportOptionsSchema.parse({
      reportTypes: ['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION'],
      groupBy: ['ORGANIZATION_UNIT', 'NONE'],
      metrics: ['requests', 'days', 'people', 'totalOvertimeHours', 'completionRate', 'exported'],
    });
  }

  async reportCustomPreview(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const normalizedQuery =
      query && typeof query === 'object' && !Array.isArray(query)
        ? { ...(query as Record<string, unknown>) }
        : {};
    if (typeof normalizedQuery.metrics === 'string') {
      normalizedQuery.metrics = [normalizedQuery.metrics];
    }

    const parsed = CustomReportPreviewQuerySchema.parse(normalizedQuery);

    const allowedMetrics = METRIC_ALLOW_LIST[parsed.reportType];
    const disallowed = parsed.metrics.filter((metric) => !allowedMetrics?.has(metric));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Unsupported metrics for ${parsed.reportType}: ${disallowed.join(', ')}`,
      );
    }

    if (parsed.reportType === 'TEAM_ABSENCE') {
      const report = await this.reportTeamAbsence(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('requests')) {
        metricValues.requests = report.totals.requests;
      }
      if (parsed.metrics.includes('days')) {
        metricValues.days = report.totals.days;
      }

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    if (parsed.reportType === 'OE_OVERTIME') {
      const report = await this.reportOeOvertime(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('people')) {
        metricValues.people = report.totals.people;
      }
      if (parsed.metrics.includes('totalOvertimeHours')) {
        metricValues.totalOvertimeHours = report.totals.totalOvertimeHours;
      }

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    const report = await this.reportClosingCompletion(user, {
      from: parsed.from,
      to: parsed.to,
    });
    const metricValues: Record<string, number> = {};
    if (parsed.metrics.includes('completionRate')) {
      metricValues.completionRate = report.totals.completionRate;
    }
    if (parsed.metrics.includes('exported')) {
      metricValues.exported = report.totals.exported;
    }

    return {
      reportType: parsed.reportType,
      groupBy: parsed.groupBy,
      from: parsed.from,
      to: parsed.to,
      rows: [
        {
          group: 'ALL',
          metrics: metricValues,
        },
      ],
    };
  }
}
