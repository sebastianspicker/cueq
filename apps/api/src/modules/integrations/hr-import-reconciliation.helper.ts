/** Performs transaction-local HR master-data reconciliation and run finalization. */
import { BadRequestException } from '@nestjs/common';
import { type Prisma, WorkTimeModelType } from '@cueq/database';
import type { AuditHelper } from '../audit/public.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
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

type ExistingPerson = { id: string; externalId: string | null; email: string };

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
    select: { id: true, externalId: true, email: true },
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

function preflightRows(querySet: HrImportQuerySet, rows: ValidatedHrImportRow[]): void {
  const batchExternalIds = new Set(rows.map((row) => row.externalId));
  for (const row of rows) {
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

async function upsertPersonForRow(
  tx: HrImportTransaction,
  row: ValidatedHrImportRow,
  querySet: HrImportQuerySet,
) {
  const existing = findExistingPersonForRow(querySet, row);
  const data = personDataForRow(row);
  const person = existing
    ? await tx.person.update({ where: { id: existing.id }, data })
    : await tx.person.create({ data });

  return { person, existing };
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
  let createdRows = 0;
  let updatedRows = 0;

  for (const row of rowsById(rows, 'organizationUnitId').values()) {
    await tx.organizationUnit.upsert({
      where: { id: row.organizationUnitId },
      create: { id: row.organizationUnitId, name: row.organizationUnit },
      update: { name: row.organizationUnit },
    });
  }
  for (const row of rowsById(rows, 'workTimeModelId').values()) {
    await tx.workTimeModel.upsert({
      where: { id: row.workTimeModelId },
      create: {
        id: row.workTimeModelId,
        name: row.workTimeModel,
        type: WorkTimeModelType.FLEXTIME,
        weeklyHours: row.parsedWeeklyHours,
        dailyTargetHours: row.parsedDailyTargetHours,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      update: {
        name: row.workTimeModel,
        weeklyHours: row.parsedWeeklyHours,
        dailyTargetHours: row.parsedDailyTargetHours,
      },
    });
  }
  for (const row of rows) {
    const { person, existing } = await upsertPersonForRow(tx, row, querySet);

    importedPeople.set(row.externalId, person.id);
    if (existing) updatedRows += 1;
    else createdRows += 1;
  }

  return { importedPeople, createdRows, updatedRows };
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
  for (const row of rows) {
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

    await tx.person.update({ where: { id: personId }, data: { supervisorId } });
  }
}

export async function reconcileHrImportRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  const querySet = await queryRows(tx, rows);
  await lockExistingPeopleForRows(tx, rows, querySet);
  preflightRows(querySet, rows);
  const result = await importValidatedRows(tx, rows, querySet);
  await linkSupervisors(tx, rows, result.importedPeople, querySet);
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
