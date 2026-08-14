/** Injectable CLI lifecycle for backup/restore verification. */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { runBackupRestoreVerification } from './run.mjs';

// prettier-ignore
const sourceUrl = process.env.DATABASE_URL ?? 'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
const postgresClientImage = process.env.POSTGRES_CLIENT_IMAGE ?? 'postgres:16-alpine';

/** Preserves CLI defaults while delegating the lifecycle to an explicit, injectable runner. */
export async function main({
  sourceUrl: configuredSourceUrl = sourceUrl,
  postgresClientImage: configuredPostgresClientImage = postgresClientImage,
  emitJsonOnly: configuredEmitJsonOnly = process.argv.includes('--json'),
  PrismaClientClass = PrismaClient,
  execFileSync: executeFile = execFileSync,
  mkdtemp: makeTempDirectory = mkdtemp,
  rm: removePath = rm,
  randomUUID: createUuid = randomUUID,
  ...options
} = {}) {
  return runBackupRestoreVerification({
    sourceUrl: configuredSourceUrl,
    postgresClientImage: configuredPostgresClientImage,
    emitJsonOnly: configuredEmitJsonOnly,
    PrismaClientClass,
    execFileSync: executeFile,
    mkdtemp: makeTempDirectory,
    rm: removePath,
    randomUUID: createUuid,
    ...options,
  });
}
