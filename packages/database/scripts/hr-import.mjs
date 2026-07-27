#!/usr/bin/env node
/** Imports validated HR master CSV data transactionally, preserving a success or failure record and audit evidence. */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Role, WorkTimeModelType } from '@prisma/client';
import { parseArgsMap } from '../../../scripts/lib/parse-args.mjs';

const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;

function normalizeRow(row) {
  return row.map((cell) => String(cell).trim());
}

function pushRow(rows, row) {
  const normalized = normalizeRow(row);
  if (normalized.every((cell) => cell.length === 0)) {
    return;
  }
  rows.push(normalized);
}

function consumeQuote(csv, index, state) {
  if (csv[index] !== '"') return null;
  if (state.inQuotes && csv[index + 1] === '"') {
    state.current += '"';
    return index + 1;
  }
  state.inQuotes = !state.inQuotes;
  return index;
}

function consumeRecordBreak(csv, index, state, rows) {
  const char = csv[index];
  if (state.inQuotes || (char !== '\n' && char !== '\r')) return null;
  state.row.push(state.current);
  state.current = '';
  pushRow(rows, state.row);
  state.row = [];
  return char === '\r' && csv[index + 1] === '\n' ? index + 1 : index;
}

function parseCsvRows(csv) {
  const rows = [];
  const state = { row: [], current: '', inQuotes: false };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const quoteIndex = consumeQuote(csv, index, state);
    if (quoteIndex !== null) {
      index = quoteIndex;
      continue;
    }

    if (char === ',' && !state.inQuotes) {
      state.row.push(state.current);
      state.current = '';
      continue;
    }

    const breakIndex = consumeRecordBreak(csv, index, state, rows);
    if (breakIndex !== null) {
      index = breakIndex;
      continue;
    }

    state.current += char;
  }

  if (state.inQuotes) {
    throw new Error('CSV parse error: unmatched quote in input.');
  }

  if (state.current.length > 0 || state.row.length > 0) {
    state.row.push(state.current);
    pushRow(rows, state.row);
  }

  return rows;
}

function recordField(row, key, fallback) {
  return row[key] ?? fallback;
}

function parsedRowFromRecord(row) {
  const supervisorExternalId = row.supervisorExternalId;
  return {
    externalId: recordField(row, 'externalId', ''),
    firstName: recordField(row, 'firstName', ''),
    lastName: recordField(row, 'lastName', ''),
    email: recordField(row, 'email', ''),
    role: recordField(row, 'role', 'EMPLOYEE'),
    organizationUnit: recordField(row, 'organizationUnit', 'Unassigned'),
    workTimeModel: recordField(row, 'workTimeModel', 'Default'),
    weeklyHours: recordField(row, 'weeklyHours', '39.83'),
    dailyTargetHours: recordField(row, 'dailyTargetHours', '7.97'),
    supervisorExternalId: supervisorExternalId || undefined,
  };
}

/** Parses RFC-style quoted CSV while rejecting ambiguous headers before import validation. */
export function parseCsvRecords(csv) {
  const parsedRows = parseCsvRows(csv);
  if (parsedRows.length < 2) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const headers = [...headerRow].map((header) => String(header).trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\ufeff/u, '');
  }
  if (headers.some((header) => header.length === 0)) {
    throw new Error('CSV parse error: header names must be non-empty.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV parse error: duplicate header names are not allowed.');
  }

  return {
    headers,
    rows: dataRows.map((values) =>
      Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ''])),
    ),
  };
}

function parseCsv(csv) {
  const { rows } = parseCsvRecords(csv);
  return rows.map(parsedRowFromRecord);
}

function slug(prefix, value) {
  return `${prefix}_${value.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`;
}

function toRole(input) {
  const normalized = String(input || 'EMPLOYEE').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(Role, normalized)) {
    return Role[normalized];
  }

  throw new Error(`Unsupported HR role: ${input}`);
}

function validateRows(rows) {
  const errors = [];
  const seenExternalIds = new Set();
  const seenEmails = new Set();

  const validatedRows = rows.flatMap((row) => {
    if (!row.externalId || !row.email || !row.firstName || !row.lastName) {
      errors.push(`Missing required fields for externalId="${row.externalId}".`);
      return [];
    }

    if (seenExternalIds.has(row.externalId)) {
      errors.push(`Duplicate externalId in batch: "${row.externalId}".`);
      return [];
    }
    if (seenEmails.has(row.email.toLowerCase())) {
      errors.push(`Duplicate email in batch: "${row.email}".`);
      return [];
    }

    seenExternalIds.add(row.externalId);
    seenEmails.add(row.email.toLowerCase());

    const weeklyHours = Number(row.weeklyHours || '39.83');
    const dailyTargetHours = Number(row.dailyTargetHours || '7.97');
    if (!Number.isFinite(weeklyHours) || weeklyHours < 0) {
      errors.push(`Invalid weeklyHours for externalId="${row.externalId}".`);
      return [];
    }
    if (!Number.isFinite(dailyTargetHours) || dailyTargetHours < 0) {
      errors.push(`Invalid dailyTargetHours for externalId="${row.externalId}".`);
      return [];
    }

    return [
      {
        ...row,
        parsedRole: toRole(row.role),
        parsedWeeklyHours: weeklyHours,
        parsedDailyTargetHours: dailyTargetHours,
        organizationUnitId: slug('ou', row.organizationUnit),
        workTimeModelId: slug('wtm', row.workTimeModel),
      },
    ];
  });

  const byExternalId = new Map(validatedRows.map((row) => [row.externalId, row]));
  for (const row of validatedRows) {
    const visited = new Set([row.externalId]);
    let supervisorExternalId = row.supervisorExternalId;
    while (supervisorExternalId && byExternalId.has(supervisorExternalId)) {
      if (visited.has(supervisorExternalId)) {
        errors.push(`Supervisor cycle detected for externalId="${row.externalId}".`);
        break;
      }
      visited.add(supervisorExternalId);
      supervisorExternalId = byExternalId.get(supervisorExternalId)?.supervisorExternalId;
    }
  }

  return { validatedRows, errors: [...new Set(errors)] };
}

async function upsertOrganizationUnit(tx, row) {
  await tx.organizationUnit.upsert({
    where: { id: row.organizationUnitId },
    create: {
      id: row.organizationUnitId,
      name: row.organizationUnit,
    },
    update: {
      name: row.organizationUnit,
    },
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
  const [byExternalId, byEmail] = await Promise.all([
    tx.person.findUnique({ where: { externalId: row.externalId } }),
    tx.person.findFirst({ where: { email: { equals: row.email, mode: 'insensitive' } } }),
  ]);
  if (byExternalId && byEmail && byExternalId.id !== byEmail.id) {
    throw new Error(
      `HR identity conflict for externalId="${row.externalId}" and email="${row.email}".`,
    );
  }
  const existing = byExternalId ?? byEmail;
  const data = personDataForRow(row);
  const person = existing
    ? await tx.person.update({
        where: { id: existing.id },
        data,
      })
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
    const [byExternalId, byEmail] = await Promise.all([
      tx.person.findUnique({ where: { externalId: row.externalId }, select: { id: true } }),
      tx.person.findFirst({
        where: { email: { equals: row.email, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);
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
  if (!row.supervisorExternalId) {
    return null;
  }

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
    if (!row.supervisorExternalId) {
      continue;
    }

    const supervisorId = await resolveSupervisorId(tx, row, importedPeople);
    if (!supervisorId) {
      throw new Error(`Supervisor externalId not found in batch: ${row.supervisorExternalId}`);
    }

    const personId = importedPeople.get(row.externalId);
    if (!personId) {
      throw new Error(`Imported person missing for externalId: ${row.externalId}`);
    }

    await tx.person.update({
      where: { id: personId },
      data: { supervisorId },
    });
  }
}

/** Serializes a validated batch, writes related records atomically, and emits success evidence in the same transaction. */
async function importRowsInTransaction(prisma, rows, baseSummary) {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw`
      SELECT pg_try_advisory_xact_lock(${HR_IMPORT_ADVISORY_LOCK_NAMESPACE}) AS acquired
    `;
    if (!lock?.acquired) {
      throw new Error('HR_IMPORT_IN_PROGRESS');
    }
    await preflightRows(tx, rows);
    const result = await importValidatedRows(tx, rows);
    await linkSupervisors(tx, rows, result.importedPeople);

    const summary = {
      ...baseSummary,
      createdRows: result.created,
      updatedRows: result.updated,
    };
    const run = await tx.hrImportRun.create({
      data: {
        source: summary.source,
        sourceFile: summary.sourceFile,
        status: 'SUCCEEDED',
        totalRows: summary.totalRows,
        createdRows: summary.createdRows,
        updatedRows: summary.updatedRows,
        skippedRows: summary.skippedRows,
        errorCount: summary.errorCount,
        summary,
        importedById: 'system:hr-import-cli',
      },
    });
    await tx.auditEntry.create({
      data: {
        actorId: 'system:hr-import-cli',
        action: 'HR_MASTER_IMPORT_COMPLETED',
        entityType: 'HrImportRun',
        entityId: run.id,
        after: summary,
        reason: 'FILE',
      },
    });
    return { run, summary };
  });
}

/** Persists a failed import record and matching audit entry after a non-lock import failure. */
async function recordFailedRun(prisma, baseSummary, error) {
  const summary = {
    ...baseSummary,
    errorCount: 1,
    errors: [error instanceof Error ? error.message : 'Unknown HR import error'],
  };
  return prisma.$transaction(async (tx) => {
    const run = await tx.hrImportRun.create({
      data: {
        source: summary.source,
        sourceFile: summary.sourceFile,
        status: 'FAILED',
        totalRows: summary.totalRows,
        createdRows: 0,
        updatedRows: 0,
        skippedRows: summary.skippedRows,
        errorCount: 1,
        summary,
        importedById: 'system:hr-import-cli',
      },
    });
    await tx.auditEntry.create({
      data: {
        actorId: 'system:hr-import-cli',
        action: 'HR_MASTER_IMPORT_COMPLETED',
        entityType: 'HrImportRun',
        entityId: run.id,
        after: summary,
        reason: 'FILE',
      },
    });
    return run;
  });
}

async function main() {
  const args = parseArgsMap(process.argv.slice(2));
  const file = args.get('--file');
  if (!file) {
    throw new Error('Missing required --file argument.');
  }

  const sourceFile = args.get('--source-file') ?? null;
  const filePath = resolve(process.cwd(), file);
  const csv = await readFile(filePath, 'utf8');
  const rows = parseCsv(csv);
  const { validatedRows, errors: validationErrors } = validateRows(rows);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('\n'));
  }

  const prisma = new PrismaClient();

  const baseSummary = {
    source: 'FILE',
    sourceFile: sourceFile ?? basename(filePath),
    totalRows: rows.length,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    errorCount: 0,
    errors: [],
  };
  try {
    const { run, summary } = await importRowsInTransaction(prisma, validatedRows, baseSummary);

    console.log(
      JSON.stringify(
        {
          id: run.id,
          ...summary,
          status: run.status,
          importedAt: run.importedAt.toISOString(),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (!(error instanceof Error && error.message === 'HR_IMPORT_IN_PROGRESS')) {
      await recordFailedRun(prisma, baseSummary, error);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof Error && error.message === 'HR_IMPORT_IN_PROGRESS') {
      console.error('HR_IMPORT_IN_PROGRESS');
    } else {
      console.error('HR import failed:', error);
    }
    process.exitCode = 1;
  });
}
