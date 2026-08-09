/** Performs transaction-local HR master-data reconciliation and run finalization. */
import { BadRequestException } from '@nestjs/common';
import { type Prisma, WorkTimeModelType } from '@cueq/database';
import type { AuditHelper } from './helpers/audit.helper.js';
import { lockPersonWrites } from './helpers/transaction-lock.helper.js';
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

async function findExistingPersonForRow(tx: HrImportTransaction, row: ValidatedHrImportRow) {
  const [byExternalId, byEmail] = await Promise.all([
    tx.person.findUnique({ where: { externalId: row.externalId }, select: { id: true } }),
    tx.person.findFirst({
      where: { email: { equals: row.email, mode: 'insensitive' } },
      select: { id: true },
    }),
  ]);

  if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
    throw new BadRequestException(
      `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
    );
  }

  return byExternalId ?? byEmail;
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

async function preflightRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]): Promise<void> {
  const batchExternalIds = new Set(rows.map((row) => row.externalId));
  for (const row of rows) {
    await findExistingPersonForRow(tx, row);
    if (row.supervisorExternalId && !batchExternalIds.has(row.supervisorExternalId)) {
      const supervisor = await tx.person.findFirst({
        where: { externalId: row.supervisorExternalId },
        select: { id: true },
      });
      if (!supervisor) {
        throw new BadRequestException(
          `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
        );
      }
    }
  }
}

async function lockExistingPeopleForRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  const existingPersonIds = new Set<string>();
  for (const row of rows) {
    const existing = await findExistingPersonForRow(tx, row);
    if (existing) existingPersonIds.add(existing.id);
  }

  await lockPersonWrites(tx, existingPersonIds);
}

async function upsertPersonForRow(tx: HrImportTransaction, row: ValidatedHrImportRow) {
  const existing = await findExistingPersonForRow(tx, row);
  const data = personDataForRow(row);
  const person = existing
    ? await tx.person.update({ where: { id: existing.id }, data })
    : await tx.person.create({ data });

  return { person, existing };
}

async function importValidatedRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  const importedPeople = new Map<string, string>();
  let createdRows = 0;
  let updatedRows = 0;

  for (const row of rows) {
    await tx.organizationUnit.upsert({
      where: { id: row.organizationUnitId },
      create: { id: row.organizationUnitId, name: row.organizationUnit },
      update: { name: row.organizationUnit },
    });
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
    const { person, existing } = await upsertPersonForRow(tx, row);

    importedPeople.set(row.externalId, person.id);
    if (existing) updatedRows += 1;
    else createdRows += 1;
  }

  return { importedPeople, createdRows, updatedRows };
}

async function resolveSupervisorId(
  tx: HrImportTransaction,
  row: ValidatedHrImportRow,
  importedPeople: Map<string, string>,
) {
  if (!row.supervisorExternalId) return null;

  return (
    importedPeople.get(row.supervisorExternalId) ??
    (
      await tx.person.findFirst({
        where: { externalId: row.supervisorExternalId },
        select: { id: true },
      })
    )?.id ??
    null
  );
}

async function linkSupervisors(
  tx: HrImportTransaction,
  rows: ValidatedHrImportRow[],
  importedPeople: Map<string, string>,
) {
  for (const row of rows) {
    const personId = importedPeople.get(row.externalId);
    if (!personId) {
      throw new BadRequestException(`Imported person missing for externalId: ${row.externalId}`);
    }

    const supervisorId = await resolveSupervisorId(tx, row, importedPeople);
    if (row.supervisorExternalId && !supervisorId) {
      throw new BadRequestException(
        `Supervisor externalId not found in batch: ${row.supervisorExternalId}`,
      );
    }

    await tx.person.update({ where: { id: personId }, data: { supervisorId } });
  }
}

export async function reconcileHrImportRows(tx: HrImportTransaction, rows: ValidatedHrImportRow[]) {
  await lockExistingPeopleForRows(tx, rows);
  await preflightRows(tx, rows);
  const result = await importValidatedRows(tx, rows);
  await linkSupervisors(tx, rows, result.importedPeople);
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
