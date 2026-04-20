#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const sourceUrl =
  process.env.DATABASE_URL ??
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
const postgresClientImage = process.env.POSTGRES_CLIENT_IMAGE ?? 'postgres:16-alpine';
const emitJsonOnly = process.argv.includes('--json');

function checksum(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function sortById(rows) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? 'public';
  const database = url.pathname.replace(/^\//u, '') || 'postgres';
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  return {
    schema,
    database,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: isLocalhost ? 'host.docker.internal' : url.hostname,
    needsHostGateway: isLocalhost,
  };
}

function withDatabase(databaseUrl, database) {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function withSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function runPgTool(args, connection, tempDir) {
  const dockerArgs = ['run', '--rm'];

  if (connection.needsHostGateway) {
    dockerArgs.push('--add-host', 'host.docker.internal:host-gateway');
  }

  dockerArgs.push(
    '-e',
    `PGPASSWORD=${connection.password}`,
    '-v',
    `${tempDir}:/backup`,
    postgresClientImage,
    ...args,
  );

  execFileSync('docker', dockerArgs, { stdio: 'pipe' });
}

function runPsql(connection, database, sql, tempDir) {
  runPgTool(
    [
      'psql',
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    connection,
    tempDir,
  );
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
    leaveAdjustments,
    onCallRotations,
    onCallDeployments,
    workflowInstances,
    workflowPolicies,
    workflowDelegationRules,
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
    prisma.leaveAdjustment.findMany(),
    prisma.onCallRotation.findMany(),
    prisma.onCallDeployment.findMany(),
    prisma.workflowInstance.findMany(),
    prisma.workflowPolicy.findMany(),
    prisma.workflowDelegationRule.findMany(),
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
    leaveAdjustments: sortById(leaveAdjustments),
    onCallRotations: sortById(onCallRotations),
    onCallDeployments: sortById(onCallDeployments),
    workflowInstances: sortById(workflowInstances),
    workflowPolicies: sortById(workflowPolicies),
    workflowDelegationRules: sortById(workflowDelegationRules),
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

async function main() {
  const connection = parseDatabaseUrl(sourceUrl);
  const tempDir = await mkdtemp(join(tmpdir(), 'cueq-backup-restore-'));
  const dumpPath = '/backup/backup.dump';
  const restoreDatabase = `cueq_restore_${randomUUID().replace(/-/gu, '_')}`;
  const restoreUrl = withSchema(withDatabase(sourceUrl, restoreDatabase), connection.schema);

  const source = new PrismaClient({
    datasources: {
      db: { url: sourceUrl },
    },
  });

  try {
    runPgTool(
      [
        'pg_dump',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        connection.database,
        '--schema',
        connection.schema,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        dumpPath,
      ],
      connection,
      tempDir,
    );

    runPsql(connection, 'postgres', `DROP DATABASE IF EXISTS "${restoreDatabase}"`, tempDir);
    runPsql(connection, 'postgres', `CREATE DATABASE "${restoreDatabase}"`, tempDir);

    runPgTool(
      [
        'pg_restore',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        restoreDatabase,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        dumpPath,
      ],
      connection,
      tempDir,
    );

    const sourceSnapshot = await snapshot(source);
    const restored = new PrismaClient({
      datasources: {
        db: { url: restoreUrl },
      },
    });

    try {
      const restoredSnapshot = await snapshot(restored);
      const report = {
        ok:
          sourceSnapshot.checksum === restoredSnapshot.checksum &&
          JSON.stringify(sourceSnapshot.tables) === JSON.stringify(restoredSnapshot.tables),
        method: 'pg_dump/pg_restore',
        source: {
          database: connection.database,
          schema: connection.schema,
          tables: sourceSnapshot.tables,
        },
        restored: {
          database: restoreDatabase,
          schema: connection.schema,
          tables: restoredSnapshot.tables,
        },
        checksums: {
          source: sourceSnapshot.checksum,
          restored: restoredSnapshot.checksum,
        },
      };

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
      runPsql(connection, 'postgres', `DROP DATABASE IF EXISTS "${restoreDatabase}"`, tempDir);
    }
  } finally {
    await source.$disconnect();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Backup/restore verification failed:', error);
  process.exitCode = 1;
});
