/** Executes role-scoped reporting queries with the provider's existing collaborators. */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role, type ClosingStatus } from '@cueq/database';
import {
  ClosingCompletionQuerySchema,
  OeOvertimeQuerySchema,
  TeamAbsenceQuerySchema,
} from '@cueq/contracts';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { AuditHelper } from '../audit/public.js';
import {
  closingCompletionTotalsFromGroups,
  databaseNumber,
  overtimeTotalsFromAggregate,
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
  const [populationRow] = await prisma.$queryRaw<Array<{ people: number | bigint }>>`
    SELECT COUNT(DISTINCT assignment."personId")::integer AS "people"
    FROM "employment_assignments" AS assignment
    INNER JOIN "persons" AS person ON person."id" = assignment."personId"
    WHERE person."role"::text IN ('EMPLOYEE', 'TEAM_LEAD', 'SHIFT_PLANNER')
      AND (assignment."employmentStartDate" IS NULL OR assignment."employmentStartDate" <= ${to})
      AND (assignment."employmentEndDate" IS NULL OR assignment."employmentEndDate" >= ${from})
      AND EXISTS (
        SELECT 1
        FROM "employment_terms" AS term
        WHERE term."assignmentId" = assignment."id"
          AND term."organizationUnitId" = ${targetOuId}
          AND (term."effectiveFrom" IS NULL OR term."effectiveFrom" <= ${to})
          AND (term."effectiveTo" IS NULL OR term."effectiveTo" > ${from})
      )
  `;
  const population = databaseNumber(populationRow?.people);
  const minGroupSize = complianceHelper.minGroupSize();
  const suppressed = population < minGroupSize;

  let totals = { requests: 0, days: 0 };
  let buckets: Array<{ type: string; requests: number; days: number }> = [];
  const canViewAbsenceTypeBuckets = HR_LIKE_ROLES.has(user.role);

  if (!suppressed) {
    const absenceGroups = await prisma.$queryRaw<
      Array<{ type: string; requests: number | bigint; days: unknown }>
    >`
      SELECT absence."type"::text AS "type",
             COUNT(*)::integer AS "requests",
             COALESCE(SUM(absence."days"), 0)::numeric AS "days"
      FROM "absences" AS absence
      WHERE absence."startDate" <= ${to}
        AND absence."endDate" >= ${from}
        AND EXISTS (
          SELECT 1
          FROM "employment_terms" AS term
          WHERE term."assignmentId" = absence."assignmentId"
            AND term."organizationUnitId" = ${targetOuId}
            AND (term."effectiveFrom" IS NULL OR term."effectiveFrom" <= absence."startDate")
            AND (term."effectiveTo" IS NULL OR term."effectiveTo" > absence."startDate")
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "employment_terms" AS other_term
          WHERE other_term."assignmentId" = absence."assignmentId"
            AND other_term."organizationUnitId" <> ${targetOuId}
            AND (other_term."effectiveFrom" IS NULL OR other_term."effectiveFrom" < absence."endDate" + INTERVAL '1 day')
            AND (other_term."effectiveTo" IS NULL OR other_term."effectiveTo" > absence."startDate")
        )
      GROUP BY absence."type"
      ORDER BY MIN(absence."startDate") ASC, absence."type" ASC
    `;
    totals = {
      requests: absenceGroups.reduce((sum, group) => sum + databaseNumber(group.requests), 0),
      days: Number(
        absenceGroups.reduce((sum, group) => sum + databaseNumber(group.days), 0).toFixed(2),
      ),
    };
    if (canViewAbsenceTypeBuckets) {
      buckets = absenceGroups.map((group) => ({
        type: group.type,
        requests: databaseNumber(group.requests),
        days: Number(databaseNumber(group.days).toFixed(2)),
      }));
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
  const [aggregate] = await prisma.$queryRaw<
    Array<{
      people: number | bigint;
      totalBalanceHours: unknown;
      totalOvertimeHours: unknown;
      invalidAccounts: number | bigint;
    }>
  >`
    WITH candidate_accounts AS (
      SELECT account.*,
             EXISTS (
               SELECT 1
               FROM "employment_terms" AS term
               WHERE term."assignmentId" = account."assignmentId"
                 AND term."organizationUnitId" = ${targetOuId}
                 AND (term."effectiveFrom" IS NULL OR term."effectiveFrom" <= account."periodStart")
                 AND (term."effectiveTo" IS NULL OR term."effectiveTo" >= account."periodEnd")
             ) AS eligible
      FROM "time_accounts" AS account
      WHERE account."periodStart" <= ${to}
        AND account."periodEnd" >= ${from}
        AND EXISTS (
          SELECT 1
          FROM "employment_terms" AS term
          WHERE term."assignmentId" = account."assignmentId"
            AND term."organizationUnitId" = ${targetOuId}
            AND (term."effectiveFrom" IS NULL OR term."effectiveFrom" <= account."periodEnd")
            AND (term."effectiveTo" IS NULL OR term."effectiveTo" > account."periodStart")
        )
    )
    SELECT COUNT(DISTINCT "personId") FILTER (WHERE eligible)::integer AS "people",
           COALESCE(SUM("balance") FILTER (WHERE eligible), 0)::numeric AS "totalBalanceHours",
           COALESCE(SUM("overtimeHours") FILTER (WHERE eligible), 0)::numeric AS "totalOvertimeHours",
           COUNT(*) FILTER (WHERE NOT eligible)::integer AS "invalidAccounts"
    FROM candidate_accounts
  `;
  if (databaseNumber(aggregate?.invalidAccounts) > 0) {
    throw new ConflictException({
      code: 'TIME_ACCOUNT_RECONCILIATION_REQUIRED',
      message:
        'An appointment account crosses an effective-term boundary; split or reconcile it before reporting.',
    });
  }
  const population = databaseNumber(aggregate?.people);
  const suppressed = population < minGroupSize;
  const totals = overtimeTotalsFromAggregate(
    {
      totalBalanceHours: aggregate?.totalBalanceHours ?? 0,
      totalOvertimeHours: aggregate?.totalOvertimeHours ?? 0,
    },
    population,
    suppressed,
  );

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

  const periods = organizationUnitId
    ? await prisma.$queryRaw<Array<{ status: ClosingStatus; count: number | bigint }>>`
        SELECT period."status"::text AS "status", COUNT(*)::integer AS "count"
        FROM "closing_periods" AS period
        WHERE period."organizationUnitId" = ${organizationUnitId}
          AND period."periodStart" <= ${to}
          AND period."periodEnd" >= ${from}
        GROUP BY period."status"
        ORDER BY period."status" ASC
      `
    : await prisma.$queryRaw<Array<{ status: ClosingStatus; count: number | bigint }>>`
        SELECT period."status"::text AS "status", COUNT(*)::integer AS "count"
        FROM "closing_periods" AS period
        WHERE period."periodStart" <= ${to}
          AND period."periodEnd" >= ${from}
        GROUP BY period."status"
        ORDER BY period."status" ASC
      `;
  const totals = closingCompletionTotalsFromGroups(periods);

  await auditHelper.appendAudit({
    actorId: actor.id,
    action: 'REPORT_ACCESSED',
    entityType: 'Report',
    entityId: `closing-completion:${parsed.from}:${parsed.to}`,
    after: { report: 'closing-completion', organizationUnitId },
  });

  return { from: parsed.from, to: parsed.to, organizationUnitId, totals };
}
