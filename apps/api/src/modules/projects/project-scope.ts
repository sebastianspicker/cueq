/** Explicit grants authorize project history; allocation writes separately require interval membership. */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import type { HrCapability } from '@cueq/contracts';

export function projectScope(actorId: string, capability: HrCapability) {
  return Prisma.sql`EXISTS (SELECT 1 FROM capability_grants g
    WHERE g."granteeId" = ${actorId} AND g.capability = ${capability}
      AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP
      AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP)
      AND (g.scope = 'GLOBAL' OR (g.scope = 'PROJECT' AND g."targetId" = p.id)
        OR (g.scope = 'ORGANIZATION' AND g."targetId" = p."organizationUnitId")
        OR (g.scope = 'SELF' AND EXISTS (SELECT 1 FROM project_memberships m
          WHERE m."projectId" = p.id AND m."personId" = ${actorId}
            AND m."effectiveFrom" <= CURRENT_TIMESTAMP))))`;
}

export async function assertProjectScope(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  actorId: string,
  capability: HrCapability,
  projectId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT p.id FROM projects p WHERE p.id = ${projectId} AND ${projectScope(actorId, capability)} LIMIT 1`,
  );
  if (!rows.length) throw new ForbiddenException('An explicit project scope grant is required.');
}
