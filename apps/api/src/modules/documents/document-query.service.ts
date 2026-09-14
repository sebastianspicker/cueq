/** Restricted document data is removed in SQL before applying page limits. */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import { CursorQuerySchema, PersonnelDocumentQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { cursorPage, cursorSqlWhere, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { assertDocumentScope, documentScope } from './document-scope.js';

@Injectable()
export class DocumentQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actorId: string, query: unknown) {
    const input = parseRequest(PersonnelDocumentQuerySchema, query);
    const personId = input.personId ?? actorId;
    const assignment = input.assignmentId
      ? Prisma.sql`AND d."assignmentId" = ${input.assignmentId}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<Prisma.PersonnelDocumentGetPayload<object>>
    >(Prisma.sql`
      SELECT d.* FROM personnel_documents d WHERE d."personId" = ${personId} ${assignment}
        AND ${documentScope(actorId, 'documents.read')}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`d."createdAt"`, Prisma.sql`d.id`, input.cursor)}
      ORDER BY d."createdAt", d.id LIMIT ${input.limit + 1}
    `);
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async detail(actorId: string, documentId: string) {
    await assertDocumentScope(this.prisma, actorId, 'documents.read', documentId);
    const { versions, ...document } = await this.prisma.personnelDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } } },
    });
    return { ...document, latestVersion: versions[0]?.version ?? 0 };
  }

  async versions(actorId: string, documentId: string, query: unknown) {
    await assertDocumentScope(this.prisma, actorId, 'documents.read', documentId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.personnelDocumentVersion.findMany({
      where: { documentId, ...cursorWhere('createdAt', input.cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: {
        id: true,
        documentId: true,
        version: true,
        checksum: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        acknowledgements: { where: { actorId }, take: 1, select: { acknowledgedAt: true } },
      },
    });
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      ({ acknowledgements, ...row }) => ({
        ...row,
        acknowledgedAt: acknowledgements[0]?.acknowledgedAt.toISOString() ?? null,
      }),
    );
  }
}
