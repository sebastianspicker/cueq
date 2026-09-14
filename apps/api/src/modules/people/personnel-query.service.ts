import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Bounded personnel projections, filtered before pagination by explicit grants. */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import {
  CursorQuerySchema,
  PersonnelQuerySchema,
  ProfileChangesQuerySchema,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { assertPersonnelScope, personnelScope } from './personnel-scope.js';

@Injectable()
export class PersonnelQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async directory(actorId: string, query: unknown) {
    const input = parseRequest(PersonnelQuerySchema, query);
    const search = input.search
      ? Prisma.sql`AND (p."firstName" ILIKE ${'%' + input.search + '%'} OR p."lastName" ILIKE ${'%' + input.search + '%'})`
      : Prisma.empty;
    const unit = input.organizationUnitId
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM employment_assignments a JOIN employment_terms t ON t."assignmentId" = a.id WHERE a."personId" = p.id AND t."organizationUnitId" = ${input.organizationUnitId} AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= CURRENT_TIMESTAMP) AND (t."effectiveTo" IS NULL OR t."effectiveTo" > CURRENT_TIMESTAMP))`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; firstName: string; lastName: string; createdAt: Date }>
    >(Prisma.sql`
      SELECT p.id, p."firstName", p."lastName", p."createdAt" FROM persons p
      WHERE ${personnelScope(actorId, 'personnel.read')} ${search} ${unit}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`p."createdAt"`, Prisma.sql`p.id`, input.cursor)}
      ORDER BY p."createdAt", p.id LIMIT ${input.limit + 1}
    `);
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async organizations(actorId: string, query: unknown) {
    const input = parseRequest(CursorQuerySchema, query);
    const scope = (unit: Prisma.Sql) =>
      Prisma.sql`EXISTS (SELECT 1 FROM capability_grants g WHERE g."granteeId" = ${actorId} AND g.capability = 'personnel.read' AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP) AND (g.scope = 'GLOBAL' OR (g.scope = 'ORGANIZATION' AND g."targetId" = ${unit}) OR (g.scope IN ('SELF','PERSON') AND EXISTS (SELECT 1 FROM employment_assignments a JOIN employment_terms t ON t."assignmentId" = a.id WHERE a."personId" = CASE WHEN g.scope = 'SELF' THEN ${actorId} ELSE g."targetId" END AND t."organizationUnitId" = ${unit} AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= CURRENT_TIMESTAMP) AND (t."effectiveTo" IS NULL OR t."effectiveTo" > CURRENT_TIMESTAMP)))))`;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; parentId: string | null; createdAt: Date }>
    >(Prisma.sql`
      SELECT o.id, o.name, o."createdAt", CASE WHEN ${scope(Prisma.sql`o."parentId"`)} THEN o."parentId" ELSE NULL END AS "parentId"
      FROM organization_units o WHERE ${scope(Prisma.sql`o.id`)}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`o."createdAt"`, Prisma.sql`o.id`, input.cursor)}
      ORDER BY o."createdAt", o.id LIMIT ${input.limit + 1}
    `);
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async profile(actorId: string, personId: string) {
    await assertPersonnelScope(this.prisma, actorId, 'personnel.read', personId);
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { id: true, firstName: true, lastName: true },
    });
    // The field vocabulary is fixed at six keys; no arbitrary unbounded attributes.
    const fields = await this.prisma.personnelField.findMany({
      where: { personId },
      take: 7,
      select: {
        key: true,
        value: true,
        ownerSystemId: true,
        revision: true,
        sourceRevision: true,
        updatedAt: true,
      },
    });
    return { ...person, fields };
  }

  async changes(actorId: string, query: unknown) {
    const input = parseRequest(ProfileChangesQuerySchema, query);
    const person = input.personId ? Prisma.sql`AND p.id = ${input.personId}` : Prisma.empty;
    const status = input.status
      ? Prisma.sql`AND r.status = ${input.status}::"ProfileChangeStatus"`
      : Prisma.empty;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT r.id FROM profile_change_requests r JOIN persons p ON p.id = r."personId"
      WHERE (${personnelScope(actorId, 'profile.approve')} OR (p.id = ${actorId} AND ${personnelScope(actorId, 'profile.request')}))
        ${person} ${status} AND ${cursorSqlWhere('createdAt', Prisma.sql`r."createdAt"`, Prisma.sql`r.id`, input.cursor)}
      ORDER BY r."createdAt", r.id LIMIT ${input.limit + 1}
    `);
    const rows = await this.prisma.profileChangeRequest.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async relationships(actorId: string, personId: string, query: unknown) {
    await assertPersonnelScope(this.prisma, actorId, 'personnel.read', personId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        subjectPersonId: string;
        relatedPersonId: string;
        kind: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT r.* FROM personnel_relationships r JOIN persons p ON p.id = r."relatedPersonId"
      WHERE r."subjectPersonId" = ${personId} AND ${personnelScope(actorId, 'personnel.read')}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`r."createdAt"`, Prisma.sql`r.id`, input.cursor)}
      ORDER BY r."createdAt", r.id LIMIT ${input.limit + 1}
    `);
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async sources(query: unknown) {
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.hrSourceSystem.findMany({
      where: cursorWhere('createdAt', input.cursor),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async outbound(sourceSystemId: string, query: unknown) {
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.personnelChangeOutbox.findMany({
      where: { sourceSystemId, ...cursorWhere('createdAt', input.cursor) },
      include: {
        request: {
          select: { personId: true, fieldKey: true, requestedValue: true, expectedRevision: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }
}
