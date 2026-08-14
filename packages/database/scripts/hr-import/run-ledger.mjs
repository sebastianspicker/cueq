function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown HR import error';
}

async function persistRunAndAudit(
  client,
  { summary, status, createdRows, updatedRows, errorCount },
) {
  const run = await client.hrImportRun.create({
    data: {
      source: summary.source,
      sourceFile: summary.sourceFile,
      status,
      totalRows: summary.totalRows,
      createdRows,
      updatedRows,
      skippedRows: summary.skippedRows,
      errorCount,
      summary,
      importedById: 'system:hr-import-cli',
    },
  });
  await client.auditEntry.create({
    data: {
      actorId: 'system:hr-import-cli',
      action: 'HR_MASTER_IMPORT_COMPLETED',
      entityType: 'HrImportRun',
      entityId: run.id,
      after: summary,
      reason: 'FILE',
    },
  });
  return run;
}

export async function recordSucceededRun(tx, summary) {
  return persistRunAndAudit(tx, {
    summary,
    status: 'SUCCEEDED',
    createdRows: summary.createdRows,
    updatedRows: summary.updatedRows,
    errorCount: summary.errorCount,
  });
}

/** Persists a failed import record and matching audit entry after a non-lock import failure. */
export async function recordFailedRun(prisma, baseSummary, error) {
  const summary = {
    ...baseSummary,
    errorCount: 1,
    errors: [errorMessage(error)],
  };
  return prisma.$transaction(async (tx) => {
    return persistRunAndAudit(tx, {
      summary,
      status: 'FAILED',
      createdRows: 0,
      updatedRows: 0,
      errorCount: 1,
    });
  });
}

export async function runWithFailureLedger(prisma, baseSummary, importRows) {
  try {
    return await importRows();
  } catch (error) {
    if (!(error instanceof Error && error.message === 'HR_IMPORT_IN_PROGRESS')) {
      await recordFailedRun(prisma, baseSummary, error);
    }
    throw error;
  }
}
