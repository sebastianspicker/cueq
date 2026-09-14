import { projectSummaryCsv, type ProjectEffortSummary } from './project-report-csv.js';
/** Privacy-thresholded project effort summaries and CSV rendering. */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectReportQuerySchema } from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import { reportingPrivacyThreshold } from '../../application/reporting/privacy-threshold.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { AuditHelper } from '../audit/public.js';
import { decimalNumber } from './project-dto.js';
import { assertProjectScope } from './project-scope.js';

type ProjectReportAggregate = {
  population: number | bigint;
  recordedMinutes: number | bigint;
};

function roundHours(value: number) {
  return Number(value.toFixed(2));
}

@Injectable()
export class ProjectReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async summary(actorId: string, projectId: string, query: unknown, format = 'json') {
    const input = parseRequest(ProjectReportQuerySchema, query);
    const from = new Date(input.from);
    const to = new Date(input.to);
    return this.prisma.$transaction(async (tx): Promise<ProjectEffortSummary> => {
      await assertProjectScope(tx, actorId, 'projects.read', projectId);
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found.');
      const [aggregate] = await tx.$queryRaw<ProjectReportAggregate[]>(Prisma.sql`
        SELECT COUNT(DISTINCT a."personId")::integer AS population,
          COALESCE(SUM(a.minutes), 0)::bigint AS "recordedMinutes"
        FROM project_time_allocations a
        JOIN bookings b ON b.id = a."bookingId"
        WHERE a."projectId" = ${projectId} AND a.minutes > 0
          AND b."startTime" >= ${from} AND b."startTime" < ${to}
      `);
      const population = Number(aggregate?.population ?? 0);
      const recordedHours = roundHours(Number(aggregate?.recordedMinutes ?? 0) / 60);
      const budgetHours = decimalNumber(project.budgetHours);
      const minGroupSize = reportingPrivacyThreshold();
      const suppressed = population < minGroupSize;
      const totals = suppressed
        ? null
        : {
            budgetHours,
            recordedHours,
            varianceHours: budgetHours === null ? null : roundHours(budgetHours - recordedHours),
          };
      await this.audit.appendAudit(
        {
          actorId,
          action: 'REPORT_ACCESSED',
          entityType: 'ProjectReport',
          entityId: `${projectId}:${input.from}:${input.to}`,
          after: {
            report: 'project-effort',
            projectId,
            format,
            suppressed,
            population,
          },
        },
        tx,
      );
      return {
        projectId: project.id,
        code: project.code,
        name: project.name,
        parentId: project.parentId,
        from: input.from,
        to: input.to,
        suppression: { suppressed, minGroupSize, population },
        totals,
      };
    });
  }

  async csv(actorId: string, projectId: string, query: unknown) {
    const summary = await this.summary(actorId, projectId, query, 'csv');
    const safeCode = summary.code.replaceAll(/[^A-Za-z0-9._-]/gu, '_').slice(0, 100);
    return {
      csv: projectSummaryCsv(summary),
      filename: `project-effort-${safeCode}-${summary.from.slice(0, 10)}-${summary.to.slice(0, 10)}.csv`,
    };
  }
}
