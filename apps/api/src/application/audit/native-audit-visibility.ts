/** Existing audit roles do not implicitly grant access to new private HR records. */
import { Prisma } from '@cueq/database';

const NATIVE_AUDIT_SCOPES: Record<string, string[]> = {
  'documents.read': ['PersonnelDocument', 'PersonnelDocumentVersion', 'DocumentUpload'],
  'personnel.read': [
    'ProfileChangeRequest',
    'PersonnelRelationship',
    'EmploymentAssignment',
    'EmploymentTerm',
    'EmploymentGroup',
    'HolidayCalendar',
  ],
  'hr.reconcile': ['HrSourceSystem'],
  'projects.read': ['Project', 'ProjectTimeAllocation', 'ProjectMembership', 'ProjectReport'],
  'lifecycle.manage': [
    'LifecycleTemplate',
    'LifecycleInstance',
    'LifecycleTask',
    'TaskGroup',
    'LifecycleAutomationRule',
  ],
};

export async function nativeAuditVisibilityWhere(
  tx: Pick<Prisma.TransactionClient, 'capabilityGrant'>,
  actorId: string,
): Promise<Prisma.AuditEntryWhereInput> {
  const now = new Date();
  const grants = await tx.capabilityGrant.groupBy({
    by: ['capability'],
    where: {
      granteeId: actorId,
      capability: { in: Object.keys(NATIVE_AUDIT_SCOPES) },
      scope: 'GLOBAL',
      targetId: null,
      revokedAt: null,
      activeFrom: { lte: now },
      OR: [{ activeTo: null }, { activeTo: { gt: now } }],
    },
  });
  const allowed = grants.flatMap((g) => NATIVE_AUDIT_SCOPES[g.capability] ?? []);
  return {
    OR: [
      { entityType: { notIn: Object.values(NATIVE_AUDIT_SCOPES).flat() } },
      { entityType: { in: allowed } },
    ],
  };
}

/** Raw reporting queries bind the audit table's entityType column in their scope. */
export function nativeAuditVisibilitySql(actorId: string) {
  const types = Object.values(NATIVE_AUDIT_SCOPES).flat();
  const capabilities = Object.entries(NATIVE_AUDIT_SCOPES).map(
    ([capability, entities]) =>
      Prisma.sql`("entityType" IN (${Prisma.join(entities)}) AND g.capability = ${capability})`,
  );
  return Prisma.sql`("entityType" NOT IN (${Prisma.join(types)}) OR EXISTS (
    SELECT 1 FROM capability_grants g WHERE g."granteeId" = ${actorId} AND g.scope = 'GLOBAL' AND g."targetId" IS NULL
      AND g."revokedAt" IS NULL AND g."activeFrom" <= CURRENT_TIMESTAMP
      AND (g."activeTo" IS NULL OR g."activeTo" > CURRENT_TIMESTAMP)
      AND (${Prisma.join(capabilities, ' OR ')})
  ))`;
}
