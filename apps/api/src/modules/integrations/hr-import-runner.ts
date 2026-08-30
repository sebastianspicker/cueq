import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { assertIntegrationToken } from './credentials/integration-token.js';
import type { AuditHelper } from '../audit/public.js';
import type { HrMasterProviderPort } from './hr-master-provider.port.js';
import {
  finalizeHrImportRun,
  reconcileHrImportRows,
  type HrImportRunSummary,
} from './hr-import-reconciliation.helper.js';
import {
  parseHrImportCsv,
  validateHrImportRows,
  type ParsedHrImportRow,
  type ValidatedHrImportRow,
} from './hr-import-validation.js';

const MAX_HR_IMPORT_CSV_BYTES = 2_000_000;
const HR_IMPORT_ADVISORY_LOCK_NAMESPACE = 1_138_425_457;
const HrImportPayloadSchema = z.object({
  source: z.enum(['FILE', 'API']).default('FILE'),
  sourceFile: z.string().optional(),
  csv: z.string().max(MAX_HR_IMPORT_CSV_BYTES).optional(),
});

type HrImportDependencies = {
  prisma: PrismaService;
  provider: HrMasterProviderPort;
  auditHelper: AuditHelper;
};

async function importRowsInTransaction(
  dependencies: HrImportDependencies,
  validatedRows: ValidatedHrImportRow[],
  baseSummary: HrImportRunSummary,
) {
  return dependencies.prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${HR_IMPORT_ADVISORY_LOCK_NAMESPACE}) AS acquired
    `;
    if (!lock?.acquired) {
      throw new ConflictException({
        code: 'HR_IMPORT_IN_PROGRESS',
        message: 'Another HR import is already in progress.',
        retryable: true,
      });
    }
    const result = await reconcileHrImportRows(tx, validatedRows);
    return finalizeHrImportRun(
      dependencies.auditHelper,
      {
        ...baseSummary,
        createdRows: result.createdRows,
        updatedRows: result.updatedRows,
        skippedRows: 0,
        errorCount: 0,
        errors: [],
      },
      tx,
    );
  });
}

export async function runHrImport(
  dependencies: HrImportDependencies,
  token: string | string[] | undefined,
  payload: unknown,
) {
  assertIntegrationToken(token, 'HR_IMPORT_TOKEN', 'dev-hr-token');
  const parsedPayload = HrImportPayloadSchema.parse(payload);

  let rows: ParsedHrImportRow[] = [];
  if (parsedPayload.source === 'API') {
    rows = await dependencies.provider.fetchMasterRecords();
  } else {
    try {
      rows = parseHrImportCsv(parsedPayload.csv ?? '');
    } catch (error) {
      throw new BadRequestException(
        `Invalid HR CSV payload: ${error instanceof Error ? error.message : 'parse error'}`,
      );
    }
  }

  const { rows: validatedRows, errors } = validateHrImportRows(rows);
  const baseSummary: HrImportRunSummary = {
    source: parsedPayload.source,
    sourceFile: parsedPayload.sourceFile ?? null,
    totalRows: rows.length,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: rows.length - validatedRows.length,
    errorCount: errors.length,
    errors,
  };
  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'HR_IMPORT_VALIDATION_FAILED',
      message: 'HR import payload validation failed.',
      errors,
    });
  }

  try {
    return await importRowsInTransaction(dependencies, validatedRows, baseSummary);
  } catch (error) {
    if (error instanceof ConflictException) throw error;
    return dependencies.prisma.$transaction((tx) =>
      finalizeHrImportRun(
        dependencies.auditHelper,
        {
          ...baseSummary,
          errorCount: 1,
          errors: [error instanceof Error ? error.message : 'Unknown HR import error'],
        },
        tx,
      ),
    );
  }
}
