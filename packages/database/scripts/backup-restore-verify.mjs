#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { URL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const sourceUrl =
  process.env.DATABASE_URL ??
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
const restoreSchema =
  (process.env.BACKUP_RESTORE_SCHEMA ?? 'backup_restore_verify').replace(/[^a-z0-9_]/giu, '_') ||
  'backup_restore_verify';

const emitJsonOnly = process.argv.includes('--json');

function schemaFromUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return url.searchParams.get('schema') ?? 'public';
}

function withSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function checksum(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function sortById(rows) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function snapshot(prisma) {
  const [
    organizationUnits,
    workTimeModels,
    persons,
    timeTypes,
    rosters,
    shifts,
    bookings,
    absences,
    onCallRotations,
    onCallDeployments,
    workflowInstances,
    closingPeriods,
    exportRuns,
    domainEventOutbox,
    webhookEndpoints,
    webhookDeliveries,
    terminalDevices,
    terminalHeartbeats,
    terminalSyncBatches,
    hrImportRuns,
    timeAccounts,
    auditEntries,
  ] = await Promise.all([
    prisma.organizationUnit.findMany(),
    prisma.workTimeModel.findMany(),
    prisma.person.findMany(),
    prisma.timeType.findMany(),
    prisma.roster.findMany(),
    prisma.shift.findMany(),
    prisma.booking.findMany(),
    prisma.absence.findMany(),
    prisma.onCallRotation.findMany(),
    prisma.onCallDeployment.findMany(),
    prisma.workflowInstance.findMany(),
    prisma.closingPeriod.findMany(),
    prisma.exportRun.findMany(),
    prisma.domainEventOutbox.findMany(),
    prisma.webhookEndpoint.findMany(),
    prisma.webhookDelivery.findMany(),
    prisma.terminalDevice.findMany(),
    prisma.terminalHeartbeat.findMany(),
    prisma.terminalSyncBatch.findMany(),
    prisma.hrImportRun.findMany(),
    prisma.timeAccount.findMany(),
    prisma.auditEntry.findMany(),
  ]);

  const data = {
    organizationUnits: sortById(organizationUnits),
    workTimeModels: sortById(workTimeModels),
    persons: sortById(persons),
    timeTypes: sortById(timeTypes),
    rosters: sortById(rosters),
    shifts: sortById(shifts),
    bookings: sortById(bookings),
    absences: sortById(absences),
    onCallRotations: sortById(onCallRotations),
    onCallDeployments: sortById(onCallDeployments),
    workflowInstances: sortById(workflowInstances),
    closingPeriods: sortById(closingPeriods),
    exportRuns: sortById(exportRuns),
    domainEventOutbox: sortById(domainEventOutbox),
    webhookEndpoints: sortById(webhookEndpoints),
    webhookDeliveries: sortById(webhookDeliveries),
    terminalDevices: sortById(terminalDevices),
    terminalHeartbeats: sortById(terminalHeartbeats),
    terminalSyncBatches: sortById(terminalSyncBatches),
    hrImportRuns: sortById(hrImportRuns),
    timeAccounts: sortById(timeAccounts),
    auditEntries: sortById(auditEntries),
  };

  const tables = Object.fromEntries(
    Object.entries(data).map(([name, rows]) => [name, rows.length]),
  );
  return { data, tables, checksum: checksum(data) };
}

async function restoreDataset(prisma, dataset) {
  if (dataset.organizationUnits.length) {
    await prisma.organizationUnit.createMany({
      data: dataset.organizationUnits,
      skipDuplicates: true,
    });
  }
  if (dataset.workTimeModels.length) {
    await prisma.workTimeModel.createMany({ data: dataset.workTimeModels, skipDuplicates: true });
  }
  if (dataset.persons.length) {
    await prisma.person.createMany({ data: dataset.persons, skipDuplicates: true });
  }
  if (dataset.timeTypes.length) {
    await prisma.timeType.createMany({ data: dataset.timeTypes, skipDuplicates: true });
  }
  if (dataset.rosters.length) {
    await prisma.roster.createMany({ data: dataset.rosters, skipDuplicates: true });
  }
  if (dataset.shifts.length) {
    await prisma.shift.createMany({ data: dataset.shifts, skipDuplicates: true });
  }
  if (dataset.bookings.length) {
    await prisma.booking.createMany({ data: dataset.bookings, skipDuplicates: true });
  }
  if (dataset.absences.length) {
    await prisma.absence.createMany({ data: dataset.absences, skipDuplicates: true });
  }
  if (dataset.onCallRotations.length) {
    await prisma.onCallRotation.createMany({
      data: dataset.onCallRotations,
      skipDuplicates: true,
    });
  }
  if (dataset.onCallDeployments.length) {
    await prisma.onCallDeployment.createMany({
      data: dataset.onCallDeployments,
      skipDuplicates: true,
    });
  }
  if (dataset.workflowInstances.length) {
    await prisma.workflowInstance.createMany({
      data: dataset.workflowInstances,
      skipDuplicates: true,
    });
  }
  if (dataset.closingPeriods.length) {
    await prisma.closingPeriod.createMany({ data: dataset.closingPeriods, skipDuplicates: true });
  }
  if (dataset.exportRuns.length) {
    await prisma.exportRun.createMany({ data: dataset.exportRuns, skipDuplicates: true });
  }
  if (dataset.domainEventOutbox.length) {
    await prisma.domainEventOutbox.createMany({
      data: dataset.domainEventOutbox,
      skipDuplicates: true,
    });
  }
  if (dataset.webhookEndpoints.length) {
    await prisma.webhookEndpoint.createMany({
      data: dataset.webhookEndpoints,
      skipDuplicates: true,
    });
  }
  if (dataset.webhookDeliveries.length) {
    await prisma.webhookDelivery.createMany({
      data: dataset.webhookDeliveries,
      skipDuplicates: true,
    });
  }
  if (dataset.terminalDevices.length) {
    await prisma.terminalDevice.createMany({ data: dataset.terminalDevices, skipDuplicates: true });
  }
  if (dataset.terminalHeartbeats.length) {
    await prisma.terminalHeartbeat.createMany({
      data: dataset.terminalHeartbeats,
      skipDuplicates: true,
    });
  }
  if (dataset.terminalSyncBatches.length) {
    await prisma.terminalSyncBatch.createMany({
      data: dataset.terminalSyncBatches,
      skipDuplicates: true,
    });
  }
  if (dataset.hrImportRuns.length) {
    await prisma.hrImportRun.createMany({ data: dataset.hrImportRuns, skipDuplicates: true });
  }
  if (dataset.timeAccounts.length) {
    await prisma.timeAccount.createMany({ data: dataset.timeAccounts, skipDuplicates: true });
  }
  if (dataset.auditEntries.length) {
    await prisma.auditEntry.createMany({ data: dataset.auditEntries, skipDuplicates: true });
  }
}

async function main() {
  const source = new PrismaClient({
    datasources: {
      db: {
        url: sourceUrl,
      },
    },
  });

  const restoreUrl = withSchema(sourceUrl, restoreSchema);

  try {
    await source.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${restoreSchema}" CASCADE`);
    await source.$executeRawUnsafe(`CREATE SCHEMA "${restoreSchema}"`);

    execSync(`DATABASE_URL='${restoreUrl}' pnpm db:push`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: restoreUrl,
      },
    });

    const sourceSnapshot = await snapshot(source);

    const restored = new PrismaClient({
      datasources: {
        db: {
          url: restoreUrl,
        },
      },
    });

    try {
      await restoreDataset(restored, sourceSnapshot.data);
      const restoredSnapshot = await snapshot(restored);

      const report = {
        ok:
          sourceSnapshot.checksum === restoredSnapshot.checksum &&
          JSON.stringify(sourceSnapshot.tables) === JSON.stringify(restoredSnapshot.tables),
        source: {
          schema: schemaFromUrl(sourceUrl),
          tables: sourceSnapshot.tables,
        },
        restored: {
          schema: restoreSchema,
          tables: restoredSnapshot.tables,
        },
        checksums: {
          source: sourceSnapshot.checksum,
          restored: restoredSnapshot.checksum,
        },
      };

      await source.auditEntry.create({
        data: {
          actorId: 'system:backup-restore',
          action: 'BACKUP_RESTORE_VERIFIED',
          entityType: 'BackupRestoreReport',
          entityId: `backup-restore-${new Date().toISOString()}`,
          after: report,
          reason: report.ok
            ? 'Backup/restore verification passed.'
            : 'Backup/restore verification failed.',
        },
      });

      if (!emitJsonOnly) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        process.stdout.write(JSON.stringify(report));
      }

      if (!report.ok) {
        process.exitCode = 1;
      }
    } finally {
      await restored.$disconnect();
    }
  } finally {
    await source.$disconnect();
  }
}

main().catch((error) => {
  console.error('Backup/restore verification failed:', error);
  process.exitCode = 1;
});
