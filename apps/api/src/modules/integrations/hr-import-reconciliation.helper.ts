/** Performs transaction-local HR master-data reconciliation and run finalization. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Prisma,
  WorkTimeModelType,
  reconcileLegacyEmployment,
  EmploymentImportConflict,
} from '@cueq/database';
import type { AuditHelper } from '../audit/public.js';
import {
  lockPersonWrites,
  lockEmploymentPopulationWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { forEachHrImportBatch } from './hr-import-batching.js';
import type { ValidatedHrImportRow } from './hr-import-validation.js';

type HrImportTransaction = Prisma.TransactionClient;

export type HrImportRunSummary = {
  source: 'FILE' | 'API';
  sourceFile: string | null;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  errorCount: number;
  errors: string[];
};

type ExistingPerson = {
  id: string;
  externalId: string | null;
  email: string;
  employmentStartDate: Date | null;
  employmentEndDate: Date | null;
};

type HrImportQuerySet = {
  existingPeople: Map<string, ExistingPerson | null>;
  peopleByExternalId: Map<string, ExistingPerson>;
};

function findExistingPersonForRow(querySet: HrImportQuerySet, row: ValidatedHrImportRow) {
  return querySet.existingPeople.get(row.externalId) ?? null;
}

function addExistingPersonForRow(
  existingPeople: Map<string, ExistingPerson | null>,
  peopleByExternalId: Map<string, ExistingPerson>,
  peopleByEmail: Map<string, ExistingPerson>,
  row: ValidatedHrImportRow,
) {
  const byExternalId = peopleByExternalId.get(row.externalId) ?? null;
  const byEmail = peopleByEmail.get(row.email.toLowerCase()) ?? null;

  if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
    throw new BadRequestException(
      `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
    );
  }

  existingPeople.set(row.externalId, byExternalId ?? byEmail);
}

async function queryRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  const externalIds = new Set<string>();
  const emails = new Set<string>();
  for (const row of rows) {
    externalIds.add(row.externalId);
    emails.add(row.email);
    if (row.supervisorExternalId) externalIds.add(row.supervisorExternalId);
  }

  const people = await tx.person.findMany({
    where: {
      OR: [
        { externalId: { in: [...externalIds] } },
        { email: { in: [...emails], mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      email: true,
      employmentStartDate: true,
      employmentEndDate: true,
    },
  });
  const peopleByExternalId = new Map<string, ExistingPerson>();
  const peopleByEmail = new Map<string, ExistingPerson>();
  for (const person of people) {
    if (person.externalId) peopleByExternalId.set(person.externalId, person);
    peopleByEmail.set(person.email.toLowerCase(), person);
  }

  const existingPeople = new Map<string, ExistingPerson | null>();
  for (const row of rows) {
    addExistingPersonForRow(existingPeople, peopleByExternalId, peopleByEmail, row);
  }

  return { existingPeople, peopleByExternalId } satisfies HrImportQuerySet;
}

function personDataForRow(row: ValidatedHrImportRow) {
  return {
    externalId: row.externalId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role: row.parsedRole,
    organizationUnitId: row.organizationUnitId,
    workTimeModelId: row.workTimeModelId,
  };
}

function newPersonDataForRow(row: ValidatedHrImportRow) {
  return {
    ...personDataForRow(row),
    employmentStartDate: row.parsedEmploymentStartDate,
    employmentEndDate: row.parsedEmploymentEndDate,
  };
}

function storedDate(value: Date | null): string | undefined {
  return value?.toISOString().slice(0, 10);
}

function assertEmploymentDatesUnchanged(existing: ExistingPerson, row: ValidatedHrImportRow) {
  if (
    row.employmentStartDate !== undefined &&
    row.employmentStartDate !== storedDate(existing.employmentStartDate)
  ) {
    throw new BadRequestException(
      `employmentStartDate differs from stored history for externalId="${row.externalId}".`,
    );
  }
  if (
    row.employmentEndDate !== undefined &&
    row.employmentEndDate !== storedDate(existing.employmentEndDate)
  ) {
    throw new BadRequestException(
      `employmentEndDate differs from stored history for externalId="${row.externalId}".`,
    );
  }
}

function preflightRows(querySet: HrImportQuerySet, rows: ValidatedHrImportRow[]): void {
  const batchExternalIds = new Set(rows.map((row) => row.externalId));
  for (const row of rows) {
    const existing = findExistingPersonForRow(querySet, row);
    if (existing) assertEmploymentDatesUnchanged(existing, row);
    if (
      row.supervisorExternalId &&
      !batchExternalIds.has(row.supervisorExternalId) &&
      !querySet.peopleByExternalId.has(row.supervisorExternalId)
    ) {
      throw new BadRequestException(
        `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
      );
    }
  }
}

async function lockExistingPeopleForRows(
  tx: HrImportTransaction,
  rows: ValidatedHrImportRow[],
  querySet: HrImportQuerySet,
) {
  const existingPersonIds = new Set<string>();
  for (const row of rows) {
    const existing = findExistingPersonForRow(querySet, row);
    if (existing) existingPersonIds.add(existing.id);
  }

  await lockPersonWrites(tx, existingPersonIds);
}

function rowsById(
  rows: ValidatedHrImportRow[],
  id: keyof Pick<ValidatedHrImportRow, 'organizationUnitId' | 'workTimeModelId'>,
) {
  const rowsById = new Map<string, ValidatedHrImportRow>();
  for (const row of rows) rowsById.set(row[id], row);
  return rowsById;
}

async function importValidatedRows(
  tx: HrImportTransaction,
  rows: ValidatedHrImportRow[],
  querySet: HrImportQuerySet,
) {
  const importedPeople = new Map<string, string>();
  const organizationUnits = [...rowsById(rows, 'organizationUnitId').values()];
  await forEachHrImportBatch(organizationUnits, async (batch) => {
    const values = batch.map(
      (row) => Prisma.sql`(${row.organizationUnitId}, ${row.organizationUnit}, CURRENT_TIMESTAMP)`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "organization_units" ("id", "name", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE
      SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP
    `);
  });

  const workTimeModels = [...rowsById(rows, 'workTimeModelId').values()];
  await forEachHrImportBatch(workTimeModels, async (batch) => {
    const values = batch.map(
      (row) => Prisma.sql`(
        ${row.workTimeModelId}, ${row.workTimeModel},
        ${WorkTimeModelType.FLEXTIME}::"WorkTimeModelType",
        ${row.parsedWeeklyHours}::numeric, ${row.parsedDailyTargetHours}::numeric,
        ${new Date('2026-01-01T00:00:00.000Z')}, CURRENT_TIMESTAMP
      )`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "work_time_models" (
        "id", "name", "type", "weeklyHours", "dailyTargetHours", "effectiveFrom", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "weeklyHours" = EXCLUDED."weeklyHours",
        "dailyTargetHours" = EXCLUDED."dailyTargetHours",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  });

  const existingRows = rows.flatMap((row) => {
    const existing = findExistingPersonForRow(querySet, row);
    return existing ? [{ existing, row }] : [];
  });
  await forEachHrImportBatch(existingRows, async (batch) => {
    const values = batch.map(({ existing, row }) => {
      const data = personDataForRow(row);
      return Prisma.sql`(
        ${existing.id}, ${data.externalId}, ${data.firstName}, ${data.lastName}, ${data.email},
        ${data.role}::"Role", ${data.organizationUnitId}, ${data.workTimeModelId}
      )`;
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "persons" AS person SET
        "externalId" = data.external_id,
        "firstName" = CASE WHEN EXISTS (SELECT 1 FROM personnel_fields f WHERE f."personId" = person.id AND f.key = 'firstName') THEN person."firstName" ELSE data.first_name END,
        "lastName" = CASE WHEN EXISTS (SELECT 1 FROM personnel_fields f WHERE f."personId" = person.id AND f.key = 'lastName') THEN person."lastName" ELSE data.last_name END,
        "email" = data.email,
        "role" = data.role::"Role",
        "organizationUnitId" = data.organization_unit_id,
        "workTimeModelId" = data.work_time_model_id,
        "updatedAt" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS data(
        id, external_id, first_name, last_name, email, role,
        organization_unit_id, work_time_model_id
      )
      WHERE person."id" = data.id
    `);
  });
  for (const { existing, row } of existingRows) importedPeople.set(row.externalId, existing.id);

  const newRows = rows.filter((row) => !findExistingPersonForRow(querySet, row));
  await forEachHrImportBatch(newRows, async (batch) => {
    const created = await tx.person.createManyAndReturn({
      data: batch.map(newPersonDataForRow),
      select: { id: true, externalId: true },
    });
    for (const person of created) {
      if (person.externalId) importedPeople.set(person.externalId, person.id);
    }
  });

  return {
    importedPeople,
    createdRows: newRows.length,
    updatedRows: existingRows.length,
  };
}

function resolveSupervisorId(
  row: ValidatedHrImportRow,
  importedPeople: Map<string, string>,
  peopleByExternalId: Map<string, ExistingPerson>,
) {
  if (!row.supervisorExternalId) return null;

  return (
    importedPeople.get(row.supervisorExternalId) ??
    peopleByExternalId.get(row.supervisorExternalId)?.id ??
    null
  );
}

async function linkSupervisors(
  tx: HrImportTransaction,
  rows: ValidatedHrImportRow[],
  importedPeople: Map<string, string>,
  querySet: HrImportQuerySet,
) {
  const links = rows.map((row) => {
    const personId = importedPeople.get(row.externalId);
    if (!personId) {
      throw new BadRequestException(`Imported person missing for externalId: ${row.externalId}`);
    }

    const supervisorId = resolveSupervisorId(row, importedPeople, querySet.peopleByExternalId);
    if (row.supervisorExternalId && !supervisorId) {
      throw new BadRequestException(
        `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
      );
    }

    return { personId, supervisorId };
  });

  await forEachHrImportBatch(links, async (batch) => {
    const values = batch.map(
      ({ personId, supervisorId }) => Prisma.sql`(${personId}::text, ${supervisorId}::text)`,
    );
    await tx.$executeRaw(Prisma.sql`
      UPDATE "persons" AS person SET
        "supervisorId" = data.supervisor_id,
        "updatedAt" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS data(id, supervisor_id)
      WHERE person."id" = data.id
    `);
  });
}

export async function reconcileHrImportRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  await lockEmploymentPopulationWrites(tx);
  const querySet = await queryRows(tx, rows);
  await lockExistingPeopleForRows(tx, rows, querySet);
  preflightRows(querySet, rows);
  const result = await importValidatedRows(tx, rows, querySet);
  await linkSupervisors(tx, rows, result.importedPeople, querySet);
  try {
    await reconcileLegacyEmployment(tx, [...result.importedPeople.values()]);
  } catch (error) {
    if (error instanceof EmploymentImportConflict) throw new ConflictException(error.message);
    throw error;
  }
  return result;
}

export async function finalizeHrImportRun(
  auditHelper: AuditHelper,
  summary: HrImportRunSummary,
  db: HrImportTransaction,
) {
  const run = await db.hrImportRun.create({
    data: {
      source: summary.source,
      sourceFile: summary.sourceFile ?? undefined,
      status: summary.errorCount > 0 ? 'FAILED' : 'SUCCEEDED',
      totalRows: summary.totalRows,
      createdRows: summary.createdRows,
      updatedRows: summary.updatedRows,
      skippedRows: summary.skippedRows,
      errorCount: summary.errorCount,
      summary: summary as Prisma.InputJsonValue,
      importedById: 'system:hr-import',
    },
  });

  await auditHelper.appendAudit(
    {
      actorId: 'system:hr-import',
      action: 'HR_MASTER_IMPORT_COMPLETED',
      entityType: 'HrImportRun',
      entityId: run.id,
      after: summary,
      reason: summary.source,
    },
    db,
  );

  return {
    id: run.id,
    source: run.source,
    sourceFile: run.sourceFile,
    status: run.status,
    totalRows: run.totalRows,
    createdRows: run.createdRows,
    updatedRows: run.updatedRows,
    skippedRows: run.skippedRows,
    errorCount: run.errorCount,
    summary: run.summary,
    importedAt: run.importedAt.toISOString(),
  };
}
