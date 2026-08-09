import { WorkTimeModelType } from '@prisma/client';
import { recordSucceededRun } from './run-ledger.mjs';

const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;

async function upsertOrganizationUnit(tx, row) {
  await tx.organizationUnit.upsert({
    where: { id: row.organizationUnitId },
    create: { id: row.organizationUnitId, name: row.organizationUnit },
    update: { name: row.organizationUnit },
  });
}

async function upsertWorkTimeModel(tx, row) {
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

function personDataForRow(row) {
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

async function upsertPersonForRow(tx, row) {
  const byExternalId = await tx.person.findUnique({ where: { externalId: row.externalId } });
  const byEmail = await tx.person.findFirst({
    where: { email: { equals: row.email, mode: 'insensitive' } },
  });
  if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
    throw new Error(
      `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
    );
  }
  const existing = byExternalId ?? byEmail;
  const data = personDataForRow(row);
  const person = existing
    ? await tx.person.update({ where: { id: existing.id }, data })
    : await tx.person.create({ data });

  return { person, existing };
}

async function importValidatedRows(tx, rows) {
  const importedPeople = new Map();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    await upsertOrganizationUnit(tx, row);
    await upsertWorkTimeModel(tx, row);
    const { person, existing } = await upsertPersonForRow(tx, row);

    importedPeople.set(row.externalId, person.id);
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { importedPeople, created, updated };
}

async function preflightRows(tx, rows) {
  const batchExternalIds = new Set(rows.map((row) => row.externalId));
  for (const row of rows) {
    const byExternalId = await tx.person.findUnique({
      where: { externalId: row.externalId },
      select: { id: true },
    });
    const byEmail = await tx.person.findFirst({
      where: { email: { equals: row.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
      throw new Error(
        `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
      );
    }
    if (row.supervisorExternalId && !batchExternalIds.has(row.supervisorExternalId)) {
      const supervisor = await tx.person.findFirst({
        where: { externalId: row.supervisorExternalId },
        select: { id: true },
      });
      if (!supervisor) {
        throw new Error(`Supervisor externalId not found in batch: ${row.supervisorExternalId}`);
      }
    }
  }
}

async function resolveSupervisorId(tx, row, importedPeople) {
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

async function linkSupervisors(tx, rows, importedPeople) {
  for (const row of rows) {
    if (!row.supervisorExternalId) continue;

    const supervisorId = await resolveSupervisorId(tx, row, importedPeople);
    if (!supervisorId) {
      throw new Error(`Supervisor externalId not found in batch: ${row.supervisorExternalId}`);
    }

    const personId = importedPeople.get(row.externalId);
    if (!personId) {
      throw new Error(`Imported person missing for externalId: ${row.externalId}`);
    }

    await tx.person.update({ where: { id: personId }, data: { supervisorId } });
  }
}

/** Serializes a validated batch, writes related records atomically, and emits success evidence in the same transaction. */
export async function importRowsInTransaction(prisma, rows, baseSummary) {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw`
      SELECT pg_try_advisory_xact_lock(${HR_IMPORT_ADVISORY_LOCK_NAMESPACE}) AS acquired
    `;
    if (!lock?.acquired) throw new Error('HR_IMPORT_IN_PROGRESS');

    await preflightRows(tx, rows);
    const result = await importValidatedRows(tx, rows);
    await linkSupervisors(tx, rows, result.importedPeople);
    const summary = {
      ...baseSummary,
      createdRows: result.created,
      updatedRows: result.updated,
    };
    const run = await recordSucceededRun(tx, summary);
    return { run, summary };
  });
}
