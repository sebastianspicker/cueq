/** Executes role-scoped reporting queries with the provider's existing collaborators. */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@cueq/database';
import {
  ClosingCompletionQuerySchema,
  OeOvertimeQuerySchema,
  TeamAbsenceQuerySchema,
} from '@cueq/contracts';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { AuditHelper } from '../audit/public.js';
import {
  absenceTotals,
  absenceTypeBuckets,
  closingCompletionTotals,
  overtimeTotals,
} from './reporting-analytics-aggregation.helper.js';
import { HR_LIKE_ROLES, type PersonHelper } from '../people/public.js';
import type { ReportingComplianceHelper } from './reporting-compliance.helper.js';

type ReportingAnalyticsCollaborators = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  personHelper: PersonHelper;
  complianceHelper: ReportingComplianceHelper;
};

export async function reportTeamAbsence(
  { prisma, auditHelper, personHelper, complianceHelper }: ReportingAnalyticsCollaborators,
  user: AuthenticatedIdentity,
  query: unknown,
) {
  const actor = await personHelper.personForUser(user);
  const parsed = TeamAbsenceQuerySchema.parse(query ?? {});
  const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

  if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
    throw new ForbiddenException('Team leads can only access reports for their own unit.');
  }

  const from = new Date(`${parsed.from}T00:00:00.000Z`);
  const to = new Date(`${parsed.to}T23:59:59.000Z`);
  const population = await prisma.person.count({
    where: {
      organizationUnitId: targetOuId,
      role: { in: [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER] },
    },
  });
  const minGroupSize = complianceHelper.minGroupSize();
  const suppressed = population < minGroupSize;

  let totals = { requests: 0, days: 0 };
  let buckets: Array<{ type: string; requests: number; days: number }> = [];
  const canViewAbsenceTypeBuckets = HR_LIKE_ROLES.has(user.role);

  if (!suppressed) {
    const absences = await prisma.absence.findMany({
      where: {
        person: { organizationUnitId: targetOuId },
        startDate: { lte: to },
        endDate: { gte: from },
      },
    });

    totals = absenceTotals(absences);
    if (canViewAbsenceTypeBuckets) {
      buckets = absenceTypeBuckets(absences);
    }
  }

  await auditHelper.appendAudit({
    actorId: actor.id,
    action: 'REPORT_ACCESSED',
    entityType: 'Report',
    entityId: `team-absence:${targetOuId}:${parsed.from}:${parsed.to}`,
    after: {
      report: 'team-absence',
      organizationUnitId: targetOuId,
      suppressed,
      absenceTypeBucketsVisible: canViewAbsenceTypeBuckets && !suppressed,
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

export async function reportOeOvertime(
  { prisma, auditHelper, personHelper, complianceHelper }: ReportingAnalyticsCollaborators,
  user: AuthenticatedIdentity,
  query: unknown,
) {
  const actor = await personHelper.personForUser(user);
  const parsed = OeOvertimeQuerySchema.parse(query ?? {});
  const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

  if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
    throw new ForbiddenException('Team leads can only access reports for their own unit.');
  }

  const from = new Date(`${parsed.from}T00:00:00.000Z`);
  const to = new Date(`${parsed.to}T23:59:59.000Z`);
  const minGroupSize = complianceHelper.minGroupSize();
  const accounts = await prisma.timeAccount.findMany({
    where: {
      person: { organizationUnitId: targetOuId },
      periodStart: { lte: to },
      periodEnd: { gte: from },
    },
    select: { personId: true, balance: true, overtimeHours: true },
  });

  const population = new Set(accounts.map((account) => account.personId)).size;
  const suppressed = population < minGroupSize;
  const totals = overtimeTotals(accounts, population, suppressed);

  await auditHelper.appendAudit({
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
    totals,
  };
}

export async function reportClosingCompletion(
  { prisma, auditHelper, personHelper }: ReportingAnalyticsCollaborators,
  user: AuthenticatedIdentity,
  query: unknown,
) {
  const actor = await personHelper.personForUser(user);
  const parsed = ClosingCompletionQuerySchema.parse(query ?? {});
  const from = new Date(`${parsed.from}T00:00:00.000Z`);
  const to = new Date(`${parsed.to}T23:59:59.000Z`);
  if (
    user.role === Role.TEAM_LEAD &&
    parsed.organizationUnitId &&
    parsed.organizationUnitId !== actor.organizationUnitId
  ) {
    throw new ForbiddenException('Team leads can only access reports for their own unit.');
  }
  const organizationUnitId =
    user.role === Role.TEAM_LEAD ? actor.organizationUnitId : (parsed.organizationUnitId ?? null);

  const periods = await prisma.closingPeriod.findMany({
    where: {
      organizationUnitId: organizationUnitId ?? undefined,
      periodStart: { lte: to },
      periodEnd: { gte: from },
    },
    select: { status: true, organizationUnitId: true },
  });
  const totals = closingCompletionTotals(periods);

  await auditHelper.appendAudit({
    actorId: actor.id,
    action: 'REPORT_ACCESSED',
    entityType: 'Report',
    entityId: `closing-completion:${parsed.from}:${parsed.to}`,
    after: { report: 'closing-completion', organizationUnitId },
  });

  return { from: parsed.from, to: parsed.to, organizationUnitId, totals };
}
