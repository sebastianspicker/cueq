import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDatabaseUrl } from './backup-restore-verify.mjs';

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
