#!/usr/bin/env node

/**
 * Delegates the HR import CLI to the database workspace so the pinned Prisma
 * client and package dependencies are used. Import validation, dry-run, audit,
 * and mutation semantics remain in the delegated implementation.
 */
import { runDatabaseWorkspaceScript } from './lib/database-cli-delegation.mjs';

process.exit(runDatabaseWorkspaceScript('hr-import.mjs'));
