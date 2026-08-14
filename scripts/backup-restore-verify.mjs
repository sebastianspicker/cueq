#!/usr/bin/env node

/**
 * Delegates the backup/restore drill to the database workspace where Prisma is
 * resolvable. The drill uses isolated schemas and exits non-zero when restored
 * counts, checksums, or audit continuity differ from the source snapshot.
 */
import { runDatabaseWorkspaceScript } from './lib/database-cli-delegation.mjs';

process.exit(runDatabaseWorkspaceScript('backup-restore-verify.mjs'));
