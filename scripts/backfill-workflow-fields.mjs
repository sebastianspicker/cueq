#!/usr/bin/env node

/**
 * Runs the workflow-field backfill inside the database workspace with the
 * pinned package manager. The delegated command preserves rerun safety and
 * reports its mutation result through the original exit code and streams.
 */
import { runDatabaseWorkspaceScript } from './lib/database-cli-delegation.mjs';

process.exitCode = runDatabaseWorkspaceScript('backfill-workflow-fields.mjs');
