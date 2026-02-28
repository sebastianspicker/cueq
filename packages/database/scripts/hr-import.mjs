#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PrismaClient, Role, WorkTimeModelType } from '@prisma/client';

function parseArgs(argv) {
  const args = { file: null, sourceFile: null };
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--file') {
      args.file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === '--source-file') {
      args.sourceFile = argv[index + 1] ?? null;
      index += 1;
    }
  }

  if (!args.file) {
    throw new Error('Missing required --file argument.');
  }

  return args;
}

function parseCsv(csv) {
  const lines = csv
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? '']));
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
  const args = parseArgs(process.argv);
  const filePath = resolve(process.cwd(), args.file);
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
      sourceFile: args.sourceFile ?? basename(filePath),
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
