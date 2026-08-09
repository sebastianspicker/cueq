/** Executes the HR CSV import command with the established Prisma lifecycle and output contract. */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseArgsMap } from '../../../../scripts/lib/parse-args.mjs';
import { importRowsInTransaction } from './persistence.mjs';
import { runWithFailureLedger } from './run-ledger.mjs';
import { parseCsv, validateRows } from './validation.mjs';

export async function runHrImportCli() {
  const args = parseArgsMap(process.argv.slice(2));
  const file = args.get('--file');
  if (!file) throw new Error('Missing required --file argument.');

  const sourceFile = args.get('--source-file') ?? null;
  const filePath = resolve(process.cwd(), file);
  const csv = await readFile(filePath, 'utf8');
  const rows = parseCsv(csv);
  const { validatedRows, errors: validationErrors } = validateRows(rows);
  if (validationErrors.length > 0) throw new Error(validationErrors.join('\n'));

  const prisma = new PrismaClient();
  const baseSummary = {
    source: 'FILE',
    sourceFile: sourceFile ?? basename(filePath),
    totalRows: rows.length,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    errorCount: 0,
    errors: [],
  };
  try {
    const { run, summary } = await runWithFailureLedger(prisma, baseSummary, () =>
      importRowsInTransaction(prisma, validatedRows, baseSummary),
    );
    console.log(
      JSON.stringify(
        {
          id: run.id,
          ...summary,
          status: run.status,
          importedAt: run.importedAt.toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
