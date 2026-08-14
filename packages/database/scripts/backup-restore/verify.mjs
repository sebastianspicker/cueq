export function containsKnownData(snapshot) {
  return snapshot.tables.persons > 0 && snapshot.tables.auditEntries > 0;
}

export function createVerificationReport({
  sourceSnapshot,
  restoredSnapshot,
  connection,
  restoreDatabase,
}) {
  const ok =
    containsKnownData(sourceSnapshot) &&
    sourceSnapshot.checksum === restoredSnapshot.checksum &&
    JSON.stringify(sourceSnapshot.tables) === JSON.stringify(restoredSnapshot.tables);
  return {
    ok,
    method: 'pg_dump/pg_restore',
    source: {
      database: connection.database,
      schema: connection.schema,
      tables: sourceSnapshot.tables,
    },
    restored: {
      database: restoreDatabase,
      schema: connection.schema,
      tables: restoredSnapshot.tables,
    },
    checksums: { source: sourceSnapshot.checksum, restored: restoredSnapshot.checksum },
  };
}

export function shouldAppendSourceAudit(report) {
  return report.ok;
}
