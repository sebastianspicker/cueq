import assert from 'node:assert/strict';
import test from 'node:test';
import { main, parseDatabaseUrl } from './backup-restore-verify.mjs';
import { createPgTools } from './backup-restore/pg-client.mjs';
import { captureStableDump, snapshot } from './backup-restore/snapshot.mjs';
import { createVerificationReport, shouldAppendSourceAudit } from './backup-restore/verify.mjs';

test('parseDatabaseUrl maps local PostgreSQL connections into the Docker host boundary', () => {
  assert.deepEqual(
    parseDatabaseUrl('postgresql://cueq:p%40ss@localhost:5433/cueq?schema=tenant_a'),
    {
      schema: 'tenant_a',
      database: 'cueq',
      port: '5433',
      user: 'cueq',
      password: 'p@ss',
      host: 'host.docker.internal',
      needsHostGateway: true,
    },
  );
});

test('parseDatabaseUrl preserves remote hosts and applies protocol defaults', () => {
  assert.deepEqual(parseDatabaseUrl('postgresql://user:pass@db.example.test/'), {
    schema: 'public',
    database: 'postgres',
    port: '5432',
    user: 'user',
    password: 'pass',
    host: 'db.example.test',
    needsHostGateway: false,
  });
});

test('PostgreSQL client commands preserve Docker gateway, password, and tool arguments', () => {
  const calls = [];
  const tools = createPgTools({
    execFileSync: (...args) => calls.push(args),
    postgresClientImage: 'postgres:16-alpine',
  });
  const connection = parseDatabaseUrl(
    'postgresql://user:secret@localhost:5432/cueq?schema=tenant_a',
  );

  tools.dumpSource(connection, '/tmp/backup', '/backup/backup.dump');
  tools.restoreDump(connection, 'cueq_restore_test', '/tmp/backup', '/backup/backup.dump');
  tools.runPsql(connection, 'postgres', 'CREATE DATABASE "cueq_restore_test"', '/tmp/backup');

  assert.deepEqual(calls[0], [
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-e',
      'PGPASSWORD=secret',
      '-v',
      '/tmp/backup:/backup',
      'postgres:16-alpine',
      'pg_dump',
      '-h',
      'host.docker.internal',
      '-p',
      '5432',
      '-U',
      'user',
      '-d',
      'cueq',
      '--schema',
      'tenant_a',
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      '/backup/backup.dump',
    ],
    { stdio: 'pipe' },
  ]);
  assert.deepEqual(calls[1][1].slice(-14), [
    'pg_restore',
    '-h',
    'host.docker.internal',
    '-p',
    '5432',
    '-U',
    'user',
    '-d',
    'cueq_restore_test',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '/backup/backup.dump',
  ]);
  assert.deepEqual(calls[2][1].slice(-13), [
    'psql',
    '-h',
    'host.docker.internal',
    '-p',
    '5432',
    '-U',
    'user',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'CREATE DATABASE "cueq_restore_test"',
  ]);
});

test('snapshot reads all 25 tables and produces a sorted SHA-256 payload', async () => {
  const tableClients = [
    'organizationUnit',
    'workTimeModel',
    'person',
    'timeType',
    'roster',
    'shift',
    'booking',
    'absence',
    'leaveAdjustment',
    'onCallRotation',
    'onCallDeployment',
    'workflowInstance',
    'workflowPolicy',
    'workflowDelegationRule',
    'closingPeriod',
    'exportRun',
    'domainEventOutbox',
    'webhookEndpoint',
    'webhookDelivery',
    'terminalDevice',
    'terminalHeartbeat',
    'terminalSyncBatch',
    'hrImportRun',
    'timeAccount',
    'auditEntry',
  ];
  const prisma = Object.fromEntries(
    tableClients.map((name) => [
      name,
      { findMany: async () => (name === 'person' ? [{ id: 'b' }, { id: 'a' }] : []) },
    ]),
  );

  const result = await snapshot(prisma);

  assert.equal(Object.keys(result.tables).length, 25);
  assert.deepEqual(result.data.persons, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(result.checksum.length, 64);
});

test('stable dump retries once and returns only a stable post-dump snapshot', async () => {
  const snapshots = [{ checksum: 'a' }, { checksum: 'b' }, { checksum: 'c' }, { checksum: 'c' }];
  const dumps = [];
  const result = await captureStableDump({
    source: {},
    snapshotSource: async () => snapshots.shift(),
    dumpSource: (...args) => dumps.push(args),
    connection: { database: 'cueq' },
    tempDir: '/tmp/backup',
    dumpPath: '/backup/backup.dump',
  });

  assert.deepEqual(result, { checksum: 'c' });
  assert.equal(dumps.length, 2);
});

test('stable dump rejects after two source changes', async () => {
  const snapshots = [{ checksum: 'a' }, { checksum: 'b' }, { checksum: 'c' }, { checksum: 'd' }];
  await assert.rejects(
    captureStableDump({
      source: {},
      snapshotSource: async () => snapshots.shift(),
      dumpSource: () => {},
      connection: {},
      tempDir: '/tmp/backup',
      dumpPath: '/backup/backup.dump',
    }),
    { message: 'SOURCE_CHANGED_DURING_BACKUP' },
  );
});

test('verification predicates require parity and known source data before source audit', () => {
  const connection = { database: 'cueq', schema: 'public' };
  const sourceSnapshot = { checksum: 'same', tables: { persons: 1, auditEntries: 1 } };
  const report = createVerificationReport({
    sourceSnapshot,
    restoredSnapshot: { checksum: 'same', tables: { persons: 1, auditEntries: 1 } },
    connection,
    restoreDatabase: 'cueq_restore_test',
  });

  assert.equal(report.ok, true);
  assert.equal(shouldAppendSourceAudit(report), true);
  assert.equal(
    createVerificationReport({
      sourceSnapshot: { checksum: 'same', tables: { persons: 1, auditEntries: 0 } },
      restoredSnapshot: { checksum: 'same', tables: { persons: 1, auditEntries: 0 } },
      connection,
      restoreDatabase: 'cueq_restore_test',
    }).ok,
    false,
  );
});

test('main emits compact JSON, audits only successful parity, and cleans restored then source resources', async () => {
  const events = [];
  const output = [];
  let clientCount = 0;
  class FakePrismaClient {
    constructor() {
      this.name = clientCount === 0 ? 'source' : 'restored';
      clientCount += 1;
      this.auditEntry = { create: async () => events.push('source-audit') };
    }
    async $disconnect() {
      events.push(`${this.name}-disconnect`);
    }
  }
  const snapshots = [
    { checksum: 'same', tables: { persons: 1, auditEntries: 1 } },
    { checksum: 'same', tables: { persons: 1, auditEntries: 1 } },
    { checksum: 'same', tables: { persons: 1, auditEntries: 1 } },
  ];

  await main({
    sourceUrl: 'postgresql://cueq:secret@db.example.test:5432/cueq?schema=public',
    PrismaClientClass: FakePrismaClient,
    execFileSync: (_command, args) =>
      events.push(
        args.includes('pg_dump') ? 'pg_dump' : args.includes('pg_restore') ? 'pg_restore' : 'psql',
      ),
    mkdtemp: async () => '/tmp/backup',
    rm: async () => events.push('temp-remove'),
    randomUUID: () => 'test-uuid',
    snapshotSource: async () => snapshots.shift(),
    emitJsonOnly: true,
    write: (value) => output.push(value),
  });

  assert.deepEqual(events, [
    'pg_dump',
    'psql',
    'psql',
    'pg_restore',
    'source-audit',
    'restored-disconnect',
    'psql',
    'source-disconnect',
    'temp-remove',
  ]);
  assert.equal(output.length, 1);
  assert.equal(output[0].includes('\n'), false);
  assert.equal(JSON.parse(output[0]).ok, true);
});

test('main sets failure without auditing when parity fails, while preserving restore-before-source cleanup', async () => {
  const events = [];
  const snapshots = [
    { checksum: 'source', tables: { persons: 1, auditEntries: 1 } },
    { checksum: 'source', tables: { persons: 1, auditEntries: 1 } },
    { checksum: 'restored', tables: { persons: 1, auditEntries: 1 } },
  ];
  let clientCount = 0;
  let exitCode;
  class FakePrismaClient {
    constructor() {
      this.name = clientCount === 0 ? 'source' : 'restored';
      clientCount += 1;
      this.auditEntry = { create: async () => events.push('source-audit') };
    }
    async $disconnect() {
      events.push(`${this.name}-disconnect`);
    }
  }

  await main({
    sourceUrl: 'postgresql://cueq:secret@db.example.test:5432/cueq?schema=public',
    PrismaClientClass: FakePrismaClient,
    execFileSync: (_command, args) =>
      events.push(
        args.includes('pg_dump') ? 'pg_dump' : args.includes('pg_restore') ? 'pg_restore' : 'psql',
      ),
    mkdtemp: async () => '/tmp/backup',
    rm: async () => events.push('temp-remove'),
    randomUUID: () => 'test-uuid',
    snapshotSource: async () => snapshots.shift(),
    emitJsonOnly: true,
    write: () => {},
    setExitCode: (code) => {
      exitCode = code;
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(events.includes('source-audit'), false);
  assert.deepEqual(events.slice(-4), [
    'restored-disconnect',
    'psql',
    'source-disconnect',
    'temp-remove',
  ]);
});
