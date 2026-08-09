import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPgTools, parseDatabaseUrl, withDatabase, withSchema } from './pg-client.mjs';
import { captureStableDump, snapshot } from './snapshot.mjs';
import { createVerificationReport, shouldAppendSourceAudit } from './verify.mjs';

/** Executes the restore lifecycle with source and restored resources cleaned in their original order. */
export async function runBackupRestoreVerification({
  sourceUrl,
  postgresClientImage,
  emitJsonOnly,
  PrismaClientClass,
  execFileSync: executeFile,
  mkdtemp: makeTempDirectory,
  rm: removePath,
  randomUUID: createUuid,
  snapshotSource = snapshot,
  log = console.log,
  write = process.stdout.write.bind(process.stdout),
  setExitCode = (code) => {
    process.exitCode = code;
  },
}) {
  const connection = parseDatabaseUrl(sourceUrl);
  const { dumpSource, restoreDump, runPsql } = createPgTools({
    execFileSync: executeFile,
    postgresClientImage,
  });
  const tempDir = await makeTempDirectory(join(tmpdir(), 'cueq-backup-restore-'));
  const dumpPath = '/backup/backup.dump';
  const restoreDatabase = `cueq_restore_${createUuid().replace(/-/gu, '_')}`;
  const restoreUrl = withSchema(withDatabase(sourceUrl, restoreDatabase), connection.schema);
  const source = new PrismaClientClass({ datasources: { db: { url: sourceUrl } } });

  try {
    const sourceSnapshot = await captureStableDump({
      source,
      snapshotSource,
      dumpSource,
      connection,
      tempDir,
      dumpPath,
    });
    runPsql(connection, 'postgres', `DROP DATABASE IF EXISTS "${restoreDatabase}"`, tempDir);
    runPsql(connection, 'postgres', `CREATE DATABASE "${restoreDatabase}"`, tempDir);
    restoreDump(connection, restoreDatabase, tempDir, dumpPath);

    const restored = new PrismaClientClass({ datasources: { db: { url: restoreUrl } } });
    try {
      const restoredSnapshot = await snapshotSource(restored);
      const report = createVerificationReport({
        sourceSnapshot,
        restoredSnapshot,
        connection,
        restoreDatabase,
      });
      if (!emitJsonOnly) log(JSON.stringify(report, null, 2));
      else write(JSON.stringify(report));

      if (!report.ok) {
        setExitCode(1);
      } else if (shouldAppendSourceAudit(report)) {
        await source.auditEntry.create({
          data: {
            id: createUuid(),
            actorId: 'system:backup-restore',
            action: 'BACKUP_RESTORE_VERIFIED',
            entityType: 'BackupRestoreReport',
            entityId: restoreDatabase,
            after: report,
            reason: 'Scheduled backup/restore verification',
          },
        });
      }
    } finally {
      await restored.$disconnect();
      runPsql(connection, 'postgres', `DROP DATABASE IF EXISTS "${restoreDatabase}"`, tempDir);
    }
  } finally {
    await source.$disconnect();
    await removePath(tempDir, { recursive: true, force: true });
  }
}
