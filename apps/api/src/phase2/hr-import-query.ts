import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../persistence/prisma.service.js';
import { assertIntegrationToken } from '../common/integrations/integration-token.js';

export async function getHrImportRun(
  prisma: PrismaService,
  token: string | string[] | undefined,
  runId: string,
) {
  assertIntegrationToken(token, 'HR_IMPORT_TOKEN', 'dev-hr-token');
  const run = await prisma.hrImportRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundException('HR import run not found.');
  return {
    id: run.id,
    source: run.source,
    sourceFile: run.sourceFile,
    status: run.status,
    totalRows: run.totalRows,
    createdRows: run.createdRows,
    updatedRows: run.updatedRows,
    skippedRows: run.skippedRows,
    errorCount: run.errorCount,
    summary: run.summary,
    importedAt: run.importedAt.toISOString(),
  };
}
