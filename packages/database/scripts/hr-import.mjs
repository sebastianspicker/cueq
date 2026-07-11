#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PrismaClient, Role, WorkTimeModelType } from '@prisma/client';
import { parseArgsMap } from '../../../scripts/lib/parse-args.mjs';

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

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (!char) {
      continue;
    }

    if (char === '"') {
      const next = csv[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(current);
      current = '';
      pushRow(rows, row);
      row = [];
      if (char === '\r' && csv[index + 1] === '\n') {
        index += 1;
      }
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error('CSV parse error: unmatched quote in input.');
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    pushRow(rows, row);
  }

  return rows;
}

function parseCsvRecords(csv) {
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
  return rows.map((row) => {
    return {
      externalId: row.externalId ?? '',
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      email: row.email ?? '',
      role: row.role ?? 'EMPLOYEE',
      organizationUnit: row.organizationUnit ?? 'Unassigned',
      workTimeModel: row.workTimeModel ?? 'Default',
      weeklyHours: row.weeklyHours ?? '39.83',
      dailyTargetHours: row.dailyTargetHours ?? '7.97',
      supervisorExternalId: row.supervisorExternalId || undefined,
    };
  });
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

  return { validatedRows, errors };
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
  const existing = await tx.person.findFirst({
    where: {
      OR: [{ externalId: row.externalId }, { email: row.email }],
    },
  });
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

async function importRowsInTransaction(prisma, rows) {
  return prisma.$transaction(async (tx) => {
    const result = await importValidatedRows(tx, rows);
    await linkSupervisors(tx, rows, result.importedPeople);

    return {
      created: result.created,
      updated: result.updated,
    };
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

  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let errorCount = 0;
  const errors = [];
  const people = [];

  try {
    const result = await importRowsInTransaction(prisma, validatedRows);

    createdRows = result.created;
    updatedRows = result.updated;

    const summary = {
      source: 'FILE',
      sourceFile: sourceFile ?? basename(filePath),
      totalRows: rows.length,
      createdRows,
      updatedRows,
      skippedRows,
      errorCount,
      errors,
    };

    const run = await prisma.hrImportRun.create({
      data: {
        source: 'FILE',
        sourceFile: summary.sourceFile,
        status: errorCount > 0 ? 'FAILED' : 'SUCCEEDED',
        totalRows: rows.length,
        createdRows,
        updatedRows,
        skippedRows,
        errorCount,
        summary,
        importedById: 'system:hr-import-cli',
      },
    });

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('HR import failed:', error);
  process.exitCode = 1;
});
