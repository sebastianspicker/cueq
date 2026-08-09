#!/usr/bin/env node
/** Compatibility CLI boundary for transactional HR master imports. */
import { pathToFileURL } from 'node:url';
import { parseCsvRecords } from './hr-import/csv.mjs';
import { runHrImportCli } from './hr-import/cli.mjs';

export { parseCsvRecords };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHrImportCli().catch((error) => {
    if (error instanceof Error && error.message === 'HR_IMPORT_IN_PROGRESS') {
      console.error('HR_IMPORT_IN_PROGRESS');
    } else {
      console.error('HR import failed:', error);
    }
    process.exitCode = 1;
  });
}
