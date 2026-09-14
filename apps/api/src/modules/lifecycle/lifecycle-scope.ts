/** Explicit task capabilities combine with current direct/group responsibility or lifecycle management. */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@cueq/database';
import type { HrCapability } from '@cueq/contracts';

type ScopeClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

function activeGrant(actorId: string, capability: HrCapability) {
  return Prisma.sql`g."granteeId" = ${actorId} AND g.capability = ${capability}
    AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP
    AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP)`;
}

/** Enclosing SQL must bind lifecycle_tasks as t and lifecycle_instances as i. */
export function lifecycleTaskScope(actorId: string, capability: 'tasks.read' | 'tasks.complete') {
  return Prisma.sql`(
    (EXISTS (SELECT 1 FROM capability_grants g WHERE ${activeGrant(actorId, capability)}
      AND (g.scope = 'GLOBAL' OR (g.scope = 'SELF' AND g."targetId" IS NULL)
        OR (g.scope = 'PERSON' AND g."targetId" = ${actorId})))
      AND (t."responsiblePersonId" = ${actorId} OR EXISTS (
        SELECT 1 FROM task_group_members gm
        WHERE gm."groupId" = t."responsibleGroupId" AND gm."personId" = ${actorId}
      )))
    OR EXISTS (SELECT 1 FROM capability_grants g WHERE ${activeGrant(actorId, 'lifecycle.manage')}
      AND (g.scope = 'GLOBAL' OR (g.scope = 'PERSON' AND g."targetId" = i."personId")
        OR (g.scope = 'ORGANIZATION' AND g."targetId" = i."organizationUnitId")))
  )`;
}

export async function assertLifecycleTaskScope(
  tx: ScopeClient,
  actorId: string,
  capability: 'tasks.read' | 'tasks.complete',
  taskId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t.id FROM lifecycle_tasks t
    JOIN lifecycle_instances i ON i.id = t."instanceId"
    WHERE t.id = ${taskId} AND ${lifecycleTaskScope(actorId, capability)} LIMIT 1
  `);
  if (!rows.length) throw new ForbiddenException('Lifecycle task is unavailable in scope.');
}

/** Enclosing SQL must bind lifecycle_instances as i. */
export function lifecycleInstanceScope(actorId: string) {
  return Prisma.sql`EXISTS (SELECT 1 FROM capability_grants g
    WHERE ${activeGrant(actorId, 'lifecycle.manage')}
      AND (g.scope = 'GLOBAL' OR (g.scope = 'PERSON' AND g."targetId" = i."personId")
        OR (g.scope = 'ORGANIZATION' AND g."targetId" = i."organizationUnitId")))`;
}

export async function assertLifecycleInstanceScope(
  tx: ScopeClient,
  actorId: string,
  instanceId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT i.id FROM lifecycle_instances i
    WHERE i.id = ${instanceId} AND ${lifecycleInstanceScope(actorId)} LIMIT 1
  `);
  if (!rows.length) throw new ForbiddenException('Lifecycle instance is unavailable in scope.');
}

export async function assertLifecycleActivationScope(
  tx: ScopeClient,
  actorId: string,
  personId: string,
  assignmentId: string,
  from: Date,
  to: Date,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a.id FROM employment_assignments a
    JOIN employment_terms t ON t."assignmentId" = a.id
    WHERE a.id = ${assignmentId} AND a."personId" = ${personId}
      AND (a."employmentStartDate" IS NULL OR a."employmentStartDate" <= ${from})
      AND (a."employmentEndDate" IS NULL OR a."employmentEndDate" >= ${from})
      AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= ${from})
      AND (t."effectiveTo" IS NULL OR t."effectiveTo" >= ${to})
      AND EXISTS (SELECT 1 FROM capability_grants g
        WHERE ${activeGrant(actorId, 'lifecycle.manage')}
          AND (g.scope = 'GLOBAL' OR (g.scope = 'PERSON' AND g."targetId" = a."personId")
            OR (g.scope = 'ORGANIZATION' AND g."targetId" = t."organizationUnitId")))
    LIMIT 1
  `);
  if (!rows.length) {
    throw new ForbiddenException('Lifecycle assignment is unavailable in scope.');
  }
}
