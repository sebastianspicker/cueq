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

  return Role.EMPLOYEE;
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

  const prisma = new PrismaClient();

  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let errorCount = 0;
  const errors = [];
  const people = [];

  try {
    for (const row of rows) {
      if (!row.externalId || !row.email || !row.firstName || !row.lastName) {
        skippedRows += 1;
        errors.push(`Skipped row with missing required fields for externalId="${row.externalId}".`);
        continue;
      }

      try {
        const organizationUnit = await prisma.organizationUnit.upsert({
          where: { id: slug('ou', row.organizationUnit) },
          create: {
            id: slug('ou', row.organizationUnit),
            name: row.organizationUnit,
          },
          update: {
            name: row.organizationUnit,
          },
        });

        const modelId = slug('wtm', row.workTimeModel);
        const weeklyHours = Number(row.weeklyHours || '39.83');
        const dailyTargetHours = Number(row.dailyTargetHours || '7.97');

        await prisma.workTimeModel.upsert({
          where: { id: modelId },
          create: {
            id: modelId,
            name: row.workTimeModel,
            type: WorkTimeModelType.FLEXTIME,
            weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : 39.83,
            dailyTargetHours: Number.isFinite(dailyTargetHours) ? dailyTargetHours : 7.97,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
          update: {
            name: row.workTimeModel,
            weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : 39.83,
            dailyTargetHours: Number.isFinite(dailyTargetHours) ? dailyTargetHours : 7.97,
          },
        });

        const existing = await prisma.person.findFirst({
          where: {
            OR: [{ externalId: row.externalId }, { email: row.email }],
          },
        });

        const person = existing
          ? await prisma.person.update({
              where: { id: existing.id },
              data: {
                externalId: row.externalId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                role: toRole(row.role),
                organizationUnitId: organizationUnit.id,
                workTimeModelId: modelId,
              },
            })
          : await prisma.person.create({
              data: {
                externalId: row.externalId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                role: toRole(row.role),
                organizationUnitId: organizationUnit.id,
                workTimeModelId: modelId,
              },
            });

        people.push({
          personId: person.id,
          externalId: row.externalId,
          supervisorExternalId: row.supervisorExternalId,
        });

        if (existing) {
          updatedRows += 1;
        } else {
          createdRows += 1;
        }
      } catch (error) {
        errorCount += 1;
        errors.push(
          `Failed row externalId="${row.externalId}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    for (const relation of people) {
      if (!relation.supervisorExternalId) {
        continue;
      }

      const supervisor = people.find(
        (candidate) => candidate.externalId === relation.supervisorExternalId,
      );

      if (!supervisor) {
        continue;
      }

      await prisma.person.update({
        where: { id: relation.personId },
        data: { supervisorId: supervisor.personId },
      });
    }

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
