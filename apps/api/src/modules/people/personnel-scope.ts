/** SQL scope predicate for personnel reads, shared by lists and individual access. */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import type { HrCapability } from '@cueq/contracts';

type Client = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** The enclosing query must bind persons as p. Organizational access uses current terms. */
export function personnelScope(actorId: string, capability: HrCapability) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "capability_grants" g
    WHERE g."granteeId" = ${actorId} AND g.capability = ${capability}
      AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP
      AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP)
      AND (
        g.scope = 'GLOBAL' OR (g.scope = 'SELF' AND p.id = ${actorId})
        OR (g.scope = 'PERSON' AND g."targetId" = p.id)
        OR (g.scope = 'ORGANIZATION' AND EXISTS (
          SELECT 1 FROM "employment_assignments" a
          JOIN "employment_terms" t ON t."assignmentId" = a.id
          WHERE a."personId" = p.id AND t."organizationUnitId" = g."targetId"
            AND (a."employmentStartDate" IS NULL OR a."employmentStartDate" <= CURRENT_TIMESTAMP)
            AND (a."employmentEndDate" IS NULL OR a."employmentEndDate" + INTERVAL '1 day' > CURRENT_TIMESTAMP)
            AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= CURRENT_TIMESTAMP)
            AND (t."effectiveTo" IS NULL OR t."effectiveTo" > CURRENT_TIMESTAMP)
        ))
      )
  )`;
}

export async function assertPersonnelScope(
  tx: Client,
  actorId: string,
  capability: HrCapability,
  personId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p.id FROM persons p WHERE p.id = ${personId} AND ${personnelScope(actorId, capability)} LIMIT 1
  `);
  // The same response covers missing and restricted resources.
  if (!rows.length) throw new ForbiddenException('An explicit personnel scope grant is required.');
}
