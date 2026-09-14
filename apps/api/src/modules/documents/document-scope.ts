/** Identical explicit-grant authorization for metadata, objects and acknowledgements. */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import type { HrCapability } from '@cueq/contracts';

export function documentScope(actorId: string, capability: HrCapability) {
  return Prisma.sql`EXISTS (SELECT 1 FROM capability_grants g
    WHERE g."granteeId" = ${actorId} AND g.capability = ${capability}
      AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP
      AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP)
      AND (g.scope = 'GLOBAL' OR (g.scope = 'SELF' AND d."personId" = ${actorId})
        OR (g.scope = 'PERSON' AND g."targetId" = d."personId")
        OR (g.scope = 'ORGANIZATION' AND g."targetId" = d."organizationUnitId")))`;
}
export async function assertDocumentScope(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  actorId: string,
  capability: HrCapability,
  documentId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT d.id FROM personnel_documents d WHERE d.id = ${documentId} AND ${documentScope(actorId, capability)} LIMIT 1`,
  );
  if (!rows.length)
    throw new ForbiddenException('Document is unavailable in the authorized scope.');
}

/** Authorize the selected appointment before resolving its private effective configuration. */
export async function assertDocumentCreationScope(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  actorId: string,
  personId: string,
  assignmentId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id FROM (
      SELECT a.id, a."personId", t."organizationUnitId" FROM employment_assignments a
      JOIN employment_terms t ON t."assignmentId" = a.id
      WHERE a.id = ${assignmentId} AND a."personId" = ${personId}
        AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= CURRENT_TIMESTAMP)
        AND (t."effectiveTo" IS NULL OR t."effectiveTo" > CURRENT_TIMESTAMP)
    ) d WHERE ${documentScope(actorId, 'documents.manage')} LIMIT 1
  `);
  if (!rows.length)
    throw new ForbiddenException('Document is unavailable in the authorized scope.');
}
