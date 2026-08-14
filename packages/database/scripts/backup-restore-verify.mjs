#!/usr/bin/env node
/** Verifies that a stable source backup restores losslessly into a disposable database. */
import { pathToFileURL } from 'node:url';
import { main } from './backup-restore/cli.mjs';

export { parseDatabaseUrl } from './backup-restore/pg-client.mjs';
export { main } from './backup-restore/cli.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Backup/restore verification failed:', error);
    process.exitCode = 1;
  });
}
