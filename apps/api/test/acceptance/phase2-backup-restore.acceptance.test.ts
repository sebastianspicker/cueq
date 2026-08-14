import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('Phase 3 acceptance scenarios (AT-01..AT-08)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AT-08 backup and restore verification', async () => {
    const cwd = join(moduleDirectory, '..', '..', '..', '..');
    const output = execSync('node scripts/backup-restore-verify.mjs --json', {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public',
      },
    }).toString('utf8');

    const report = JSON.parse(output) as {
      ok: boolean;
      source: { tables: Record<string, number> };
    };
    expect(report.ok).toBe(true);
    expect(report.source.tables.auditEntries).toBeGreaterThan(0);
  }, 20_000);
});
