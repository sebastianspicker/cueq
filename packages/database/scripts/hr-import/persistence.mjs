import { WorkTimeModelType } from '@prisma/client';
import { recordSucceededRun } from './run-ledger.mjs';

const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;

function organizationUnitDataForRow(row) {
  return { id: row.organizationUnitId, name: row.organizationUnit };
}

async function upsertOrganizationUnit(tx, row) {
  const data = organizationUnitDataForRow(row);
  await tx.organizationUnit.upsert({
    where: { id: data.id },
    create: data,
    update: { name: data.name },
  });
}

function workTimeModelDataForRow(row) {
  return {
    id: row.workTimeModelId,
    name: row.workTimeModel,
    weeklyHours: row.parsedWeeklyHours,
    dailyTargetHours: row.parsedDailyTargetHours,
  };
}

async function upsertWorkTimeModel(tx, row) {
  const data = workTimeModelDataForRow(row);
  await tx.workTimeModel.upsert({
    where: { id: data.id },
    create: {
      ...data,
      type: WorkTimeModelType.FLEXTIME,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
    update: {
      name: data.name,
      weeklyHours: data.weeklyHours,
      dailyTargetHours: data.dailyTargetHours,
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

function normalizedEmail(email) {
  return email.toLowerCase();
}

function resolveExistingPerson(row, existingPeople) {
  const byExternalId = existingPeople.byExternalId.get(row.externalId);
  const byEmail = existingPeople.byEmail.get(normalizedEmail(row.email));
  if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
    throw new Error(
      `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
    );
  }
  return byExternalId ?? byEmail ?? null;
}

async function upsertPersonForRow(tx, row, existingPeople) {
  const existing = resolveExistingPerson(row, existingPeople);
  const data = personDataForRow(row);
  const person = existing
    ? await tx.person.update({ where: { id: existing.id }, data })
    : await tx.person.create({ data });

  return { person, existing };
}

function sameReferenceData(previous, next) {
  return Object.entries(next).every(([key, value]) => previous?.[key] === value);
}

async function importValidatedRows(tx, rows, existingPeople) {
  const importedPeople = new Map();
  const importedOrganizationUnits = new Map();
  const importedWorkTimeModels = new Map();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const organizationUnit = organizationUnitDataForRow(row);
    if (!sameReferenceData(importedOrganizationUnits.get(organizationUnit.id), organizationUnit)) {
      await upsertOrganizationUnit(tx, row);
      importedOrganizationUnits.set(organizationUnit.id, organizationUnit);
    }

    const workTimeModel = workTimeModelDataForRow(row);
    if (!sameReferenceData(importedWorkTimeModels.get(workTimeModel.id), workTimeModel)) {
      await upsertWorkTimeModel(tx, row);
      importedWorkTimeModels.set(workTimeModel.id, workTimeModel);
    }

    const { person, existing } = await upsertPersonForRow(tx, row, existingPeople);

    importedPeople.set(row.externalId, person.id);
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { importedPeople, created, updated };
}

function lookupInputsForRows(rows) {
  const batchExternalIds = new Set(rows.map((row) => row.externalId));
  const externalIds = new Set(rows.map((row) => row.externalId));
  for (const row of rows) {
    if (row.supervisorExternalId && !batchExternalIds.has(row.supervisorExternalId)) {
      externalIds.add(row.supervisorExternalId);
    }
  }
  return {
    batchExternalIds,
    externalIds: [...externalIds],
    emails: rows.map((row) => row.email),
  };
}

function indexExistingPeople(existingPeople) {
  return {
    byExternalId: new Map(
      existingPeople.flatMap((person) => (person.externalId ? [[person.externalId, person]] : [])),
    ),
    byEmail: new Map(existingPeople.map((person) => [normalizedEmail(person.email), person])),
  };
}

function assertRowsResolvable(rows, batchExternalIds, existingPeople) {
  for (const row of rows) {
    resolveExistingPerson(row, existingPeople);
    if (
      row.supervisorExternalId &&
      !batchExternalIds.has(row.supervisorExternalId) &&
      !existingPeople.byExternalId.has(row.supervisorExternalId)
    ) {
      throw new Error(`Supervisor externalId not found in batch: ${row.supervisorExternalId}`);
    }
  }
}

async function preflightRows(tx, rows) {
  const lookupInputs = lookupInputsForRows(rows);

  const people =
    rows.length === 0
      ? []
      : await tx.person.findMany({
          where: {
            OR: [
              { externalId: { in: lookupInputs.externalIds } },
              { email: { in: lookupInputs.emails, mode: 'insensitive' } },
            ],
          },
          select: { id: true, externalId: true, email: true },
        });
  const existingPeople = indexExistingPeople(people);
  assertRowsResolvable(rows, lookupInputs.batchExternalIds, existingPeople);

  return existingPeople;
}

async function resolveSupervisorId(row, importedPeople, existingPeople) {
  if (!row.supervisorExternalId) return null;
  return (
    importedPeople.get(row.supervisorExternalId) ??
    existingPeople.byExternalId.get(row.supervisorExternalId)?.id ??
    null
  );
}

async function linkSupervisors(tx, rows, importedPeople, existingPeople) {
  for (const row of rows) {
    if (!row.supervisorExternalId) continue;

    const supervisorId = await resolveSupervisorId(row, importedPeople, existingPeople);
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

    const existingPeople = await preflightRows(tx, rows);
    const result = await importValidatedRows(tx, rows, existingPeople);
    await linkSupervisors(tx, rows, result.importedPeople, existingPeople);
    const summary = {
      ...baseSummary,
      createdRows: result.created,
      updatedRows: result.updated,
    };
    const run = await recordSucceededRun(tx, summary);
    return { run, summary };
  });
}
