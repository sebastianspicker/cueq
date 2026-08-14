import type { AuthenticatedIdentity } from '../common/auth/auth.types.js';
import {
  importTerminalBatch,
  type TerminalBatchImportDependencies,
} from './terminal-batch-import.helper.js';
import {
  TerminalSyncBatchFileSchema,
  type TerminalSyncBatchFileInput,
} from './terminal-contracts.js';
import { parseHoneywellCsv } from './terminal-csv-parser.js';

/** Parses the file adapter before forwarding its canonical records to the existing batch transaction. */
export async function importTerminalBatchFile(
  dependencies: TerminalBatchImportDependencies,
  user: AuthenticatedIdentity,
  actorId: string,
  payload: unknown,
) {
  const parsed = TerminalSyncBatchFileSchema.parse(payload) as TerminalSyncBatchFileInput;
  const { records, rawRows, validRows, malformedRows } = parseHoneywellCsv(parsed.csv);
  const imported = await importTerminalBatch(
    dependencies,
    user,
    actorId,
    { terminalId: parsed.terminalId, sourceFile: parsed.sourceFile, records },
    { rawRows, validRows, malformedRows },
  );
  return { ...imported, protocol: parsed.protocol, rawRows, validRows, malformedRows };
}
