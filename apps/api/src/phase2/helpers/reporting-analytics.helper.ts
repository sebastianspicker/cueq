import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClosingStatus, Role } from '@cueq/database';
import {
  ClosingCompletionQuerySchema,
  OeOvertimeQuerySchema,
  TeamAbsenceQuerySchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from './audit.helper';
import { PersonHelper } from './person.helper';
import { ReportingComplianceHelper } from './reporting-compliance.helper';
import { REPORT_ALLOWED_ROLES } from './role-constants';

@Injectable()
export class ReportingAnalyticsHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(ReportingComplianceHelper) private readonly complianceHelper: ReportingComplianceHelper,
  ) {}

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
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
    const minGroupSize = this.complianceHelper.minGroupSize();
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
      suppression: { suppressed, minGroupSize, population },
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
    const minGroupSize = this.complianceHelper.minGroupSize();

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
      suppression: { suppressed, minGroupSize, population },
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
      exported: periods.filter((p) => p.status === ClosingStatus.EXPORTED).length,
      approved: periods.filter((p) => p.status === ClosingStatus.CLOSED).length,
      review: periods.filter((p) => p.status === ClosingStatus.REVIEW).length,
      open: periods.filter((p) => p.status === ClosingStatus.OPEN).length,
      completionRate:
        periods.length === 0
          ? 0
          : Number(
              (
                periods.filter((p) => p.status === ClosingStatus.EXPORTED).length / periods.length
              ).toFixed(4),
            ),
    };

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `closing-completion:${parsed.from}:${parsed.to}`,
      after: { report: 'closing-completion' },
    });

    return { from: parsed.from, to: parsed.to, totals };
  }
}
