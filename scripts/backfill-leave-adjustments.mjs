#!/usr/bin/env node

/**
 * Runs the leave-adjustment backfill inside the database workspace so it uses
 * the pinned toolchain and package-local Prisma client. The delegated command
 * owns dry-run, idempotency, audit, and database-mutation behavior.
 */
import { runDatabaseWorkspaceScript } from './lib/database-cli-delegation.mjs';

process.exitCode = runDatabaseWorkspaceScript('backfill-leave-adjustments.mjs');
