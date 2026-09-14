import { reconcileLegacyEmployment } from '../../dist/legacy-employment.js';
import { Prisma, WorkTimeModelType } from '@prisma/client';
import { recordSucceededRun } from './run-ledger.mjs';
import { forEachHrImportBatch } from './batching.mjs';

const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;

function organizationUnitDataForRow(row) {
  return { id: row.organizationUnitId, name: row.organizationUnit };
}

function workTimeModelDataForRow(row) {
  return {
    id: row.workTimeModelId,
    name: row.workTimeModel,
    weeklyHours: row.parsedWeeklyHours,
    dailyTargetHours: row.parsedDailyTargetHours,
  };
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

function newPersonDataForRow(row) {
  return {
    ...personDataForRow(row),
    employmentStartDate: row.parsedEmploymentStartDate,
    employmentEndDate: row.parsedEmploymentEndDate,
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

function storedDate(value) {
  return value?.toISOString().slice(0, 10);
}

function assertEmploymentDatesUnchanged(existing, row) {
  if (
    row.employmentStartDate !== undefined &&
    row.employmentStartDate !== storedDate(existing.employmentStartDate)
  ) {
    throw new Error(
      `employmentStartDate differs from stored history for externalId="${row.externalId}".`,
    );
  }
  if (
    row.employmentEndDate !== undefined &&
    row.employmentEndDate !== storedDate(existing.employmentEndDate)
  ) {
    throw new Error(
      `employmentEndDate differs from stored history for externalId="${row.externalId}".`,
    );
  }
}

function rowsById(rows, id) {
  const rowsByIdentifier = new Map();
  for (const row of rows) rowsByIdentifier.set(row[id], row);
  return [...rowsByIdentifier.values()];
}

async function importValidatedRows(tx, rows, existingPeople) {
  const importedPeople = new Map();
  await forEachHrImportBatch(rowsById(rows, 'organizationUnitId'), async (batch) => {
    const values = batch.map((row) => {
      const data = organizationUnitDataForRow(row);
      return Prisma.sql`(${data.id}, ${data.name}, CURRENT_TIMESTAMP)`;
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "organization_units" ("id", "name", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE
      SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP
    `);
  });

  await forEachHrImportBatch(rowsById(rows, 'workTimeModelId'), async (batch) => {
    const values = batch.map((row) => {
      const data = workTimeModelDataForRow(row);
      return Prisma.sql`(
        ${data.id}, ${data.name}, ${WorkTimeModelType.FLEXTIME}::"WorkTimeModelType",
        ${data.weeklyHours}::numeric, ${data.dailyTargetHours}::numeric,
        ${new Date('2026-01-01T00:00:00.000Z')}, CURRENT_TIMESTAMP
      )`;
    });
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
    const existing = resolveExistingPerson(row, existingPeople);
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

  const newRows = rows.filter((row) => !resolveExistingPerson(row, existingPeople));
  await forEachHrImportBatch(newRows, async (batch) => {
    const created = await tx.person.createManyAndReturn({
      data: batch.map(newPersonDataForRow),
      select: { id: true, externalId: true },
    });
    for (const person of created) {
      if (person.externalId) importedPeople.set(person.externalId, person.id);
    }
  });

  return { importedPeople, created: newRows.length, updated: existingRows.length };
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
    const existing = resolveExistingPerson(row, existingPeople);
    if (existing) assertEmploymentDatesUnchanged(existing, row);
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
          select: {
            id: true,
            externalId: true,
            email: true,
            employmentStartDate: true,
            employmentEndDate: true,
          },
        });
  const existingPeople = indexExistingPeople(people);

  for (const id of [...new Set(people.map((person) => person.id))].sort()) {
    const [lock] =
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${`cueq:person-write:${id}`}, 0)) AS acquired`;
    if (!lock?.acquired) throw new Error('PERSON_WRITE_IN_PROGRESS');
  }
  assertRowsResolvable(rows, lookupInputs.batchExternalIds, existingPeople);
  return existingPeople;
}

function resolveSupervisorId(row, importedPeople, existingPeople) {
  if (!row.supervisorExternalId) return null;
  return (
    importedPeople.get(row.supervisorExternalId) ??
    existingPeople.byExternalId.get(row.supervisorExternalId)?.id ??
    null
  );
}

async function linkSupervisors(tx, rows, importedPeople, existingPeople) {
  const links = [];
  for (const row of rows) {
    if (!row.supervisorExternalId) continue;

    const supervisorId = resolveSupervisorId(row, importedPeople, existingPeople);
    if (!supervisorId) {
      throw new Error(`Supervisor externalId not found in batch: ${row.supervisorExternalId}`);
    }

    const personId = importedPeople.get(row.externalId);
    if (!personId) {
      throw new Error(`Imported person missing for externalId: ${row.externalId}`);
    }

    links.push({ personId, supervisorId });
  }

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

/** Serializes a validated batch, writes related records atomically, and emits success evidence in the same transaction. */
export async function importRowsInTransaction(prisma, rows, baseSummary) {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw`
      SELECT pg_try_advisory_xact_lock(${HR_IMPORT_ADVISORY_LOCK_NAMESPACE}) AS acquired
    `;
    if (!lock?.acquired) throw new Error('HR_IMPORT_IN_PROGRESS');

    const [populationLock] =
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${'cueq:employment-population'}, 0)) AS acquired`;
    if (!populationLock?.acquired) throw new Error('EMPLOYMENT_POPULATION_WRITE_IN_PROGRESS');
    const existingPeople = await preflightRows(tx, rows);
    const result = await importValidatedRows(tx, rows, existingPeople);
    await linkSupervisors(tx, rows, result.importedPeople, existingPeople);
    await reconcileLegacyEmployment(tx, [...result.importedPeople.values()]);
    const summary = {
      ...baseSummary,
      createdRows: result.created,
      updatedRows: result.updated,
    };
    const run = await recordSucceededRun(tx, summary);
    return { run, summary };
  });
}
