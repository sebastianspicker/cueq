/** Bounded project discovery and detail reads under explicit capability scope. */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectQuerySchema } from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { projectDto, type ProjectRecord } from './project-dto.js';
import { assertProjectScope, projectScope } from './project-scope.js';

function archivedPredicate(archived: 'true' | 'false' | undefined) {
  return archived === 'true'
    ? Prisma.sql`p."archivedAt" IS NOT NULL`
    : Prisma.sql`p."archivedAt" IS NULL`;
}

function searchPredicate(search: string | undefined) {
  if (!search?.trim()) return Prisma.sql`TRUE`;
  const pattern = `%${search.trim()}%`;
  return Prisma.sql`(p.code ILIKE ${pattern} OR p.name ILIKE ${pattern})`;
}

@Injectable()
export class ProjectQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actorId: string, query: unknown) {
    const input = parseRequest(ProjectQuerySchema, query);
    const rows = await this.prisma.$queryRaw<ProjectRecord[]>(Prisma.sql`
      SELECT p.id, p.code, p.name, p."parentId", p."organizationUnitId", p."managerId",
        p."costCentre", p."fundingReference", p."budgetHours", p."archivedAt",
        p."createdAt", p."updatedAt"
      FROM projects p
      WHERE ${projectScope(actorId, 'projects.read')}
        AND ${archivedPredicate(input.archived)}
        AND ${searchPredicate(input.search)}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`p."createdAt"`, Prisma.sql`p.id`, input.cursor)}
      ORDER BY p."createdAt" ASC, p.id ASC
      LIMIT ${input.limit + 1}
    `);
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, projectDto);
  }

  async detail(actorId: string, projectId: string) {
    await assertProjectScope(this.prisma, actorId, 'projects.read', projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found.');
    return projectDto(project);
  }
}
