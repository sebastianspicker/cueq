function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown HR import error';
}

export async function recordSucceededRun(tx, summary) {
  const run = await tx.hrImportRun.create({
    data: {
      source: summary.source,
      sourceFile: summary.sourceFile,
      status: 'SUCCEEDED',
      totalRows: summary.totalRows,
      createdRows: summary.createdRows,
      updatedRows: summary.updatedRows,
      skippedRows: summary.skippedRows,
      errorCount: summary.errorCount,
      summary,
      importedById: 'system:hr-import-cli',
    },
  });
  await tx.auditEntry.create({
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

/** Persists a failed import record and matching audit entry after a non-lock import failure. */
export async function recordFailedRun(prisma, baseSummary, error) {
  const summary = {
    ...baseSummary,
    errorCount: 1,
    errors: [errorMessage(error)],
  };
  return prisma.$transaction(async (tx) => {
    const run = await tx.hrImportRun.create({
      data: {
        source: summary.source,
        sourceFile: summary.sourceFile,
        status: 'FAILED',
        totalRows: summary.totalRows,
        createdRows: 0,
        updatedRows: 0,
        skippedRows: summary.skippedRows,
        errorCount: 1,
        summary,
        importedById: 'system:hr-import-cli',
      },
    });
    await tx.auditEntry.create({
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
