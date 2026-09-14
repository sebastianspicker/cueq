/** Compatibility imports initialize appointments without rewriting effective history. */
import { Prisma } from '@prisma/client';

export class EmploymentImportConflict extends Error {
  constructor(message?: string) {
    super(
      message ??
        'Legacy HR import changes effective appointment configuration. Reconcile an explicit dated term before retrying.',
    );
    this.name = 'EmploymentImportConflict';
  }
}

/** Called after identity/supervisor writes, within the same locked transaction. */
export async function reconcileLegacyEmployment(tx: Prisma.TransactionClient, personIds: string[]) {
  for (let offset = 0; offset < personIds.length; offset += 500) {
    const ids = personIds.slice(offset, offset + 500);
    if (!ids.length) continue;
    const closedPopulation = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM persons p
      WHERE p.id IN (${Prisma.join(ids)})
        AND NOT EXISTS (SELECT 1 FROM employment_assignments a WHERE a."personId" = p.id)
        AND EXISTS (SELECT 1 FROM closing_periods c
          WHERE c.status <> 'OPEN'
            AND (c."organizationUnitId" IS NULL OR c."organizationUnitId" = p."organizationUnitId")
            AND (p."employmentStartDate" IS NULL OR p."employmentStartDate" <= c."periodEnd")
            AND (p."employmentEndDate" IS NULL OR p."employmentEndDate" + INTERVAL '1 day' > c."periodStart"))
      LIMIT 1
    `);
    if (closedPopulation.length)
      throw new EmploymentImportConflict(
        'A new legacy appointment would change a locked closing population. Reconcile explicit employment dates before importing.',
      );
    // No synthetic dates or employment values: preserve nullable legacy metadata.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO employment_assignments (id, "personId", "sourceSystem", "externalAppointmentId", label, legacy, "employmentStartDate", "employmentEndDate", "createdAt", "updatedAt")
      SELECT 'c' || substr(md5('cueq:assignment:' || p.id), 1, 24), p.id, 'legacy-hr', p.id,
        'Legacy appointment', TRUE, p."employmentStartDate", p."employmentEndDate", p."createdAt", CURRENT_TIMESTAMP
      FROM persons p WHERE p.id IN (${Prisma.join(ids)})
      AND NOT EXISTS (SELECT 1 FROM employment_assignments a WHERE a."personId" = p.id)
      ON CONFLICT (id) DO NOTHING
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO employment_terms (id, "assignmentId", "organizationUnitId", "supervisorId", "workTimeModelId", "weeklyHours", "dailyTargetHours", "workingDays", "employmentGroupId", "holidayCalendarId", "policyReferences", "createdAt")
      SELECT 'c' || substr(md5('cueq:term:' || p.id), 1, 24), a.id, p."organizationUnitId", p."supervisorId", p."workTimeModelId", m."weeklyHours", m."dailyTargetHours", ARRAY[1,2,3,4,5],
        'cd98873a4d3da5b3a0370703a', 'ce1c57004d19635e7cd5ada1d', '{"leave":"leave-tvl-default@1","origin":"legacy-reference"}'::jsonb, p."createdAt"
      FROM persons p JOIN employment_assignments a ON a."personId" = p.id AND a.legacy = TRUE
      LEFT JOIN work_time_models m ON m.id = p."workTimeModelId"
      WHERE p.id IN (${Prisma.join(ids)}) AND NOT EXISTS (SELECT 1 FROM employment_terms t WHERE t."assignmentId" = a.id)
      ON CONFLICT (id) DO NOTHING
    `);
    const conflicts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM persons p JOIN employment_assignments a ON a."personId" = p.id AND a.legacy = TRUE
      JOIN employment_terms t ON t."assignmentId" = a.id
      LEFT JOIN work_time_models m ON m.id = p."workTimeModelId"
      WHERE p.id IN (${Prisma.join(ids)})
        AND (t."effectiveFrom" IS NULL OR t."effectiveFrom" <= CURRENT_TIMESTAMP)
        AND (t."effectiveTo" IS NULL OR t."effectiveTo" > CURRENT_TIMESTAMP)
        AND (t."organizationUnitId" IS DISTINCT FROM p."organizationUnitId"
          OR t."supervisorId" IS DISTINCT FROM p."supervisorId"
          OR t."workTimeModelId" IS DISTINCT FROM p."workTimeModelId"
          OR t."weeklyHours" IS DISTINCT FROM m."weeklyHours"
          OR t."dailyTargetHours" IS DISTINCT FROM m."dailyTargetHours")
      LIMIT 1
    `);
    if (conflicts.length) throw new EmploymentImportConflict();
  }
}
