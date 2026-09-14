export function containsKnownData(snapshot) {
  return snapshot.tables.Person > 0 && snapshot.tables.AuditEntry > 0;
}

export function createVerificationReport({
  sourceSnapshot,
  restoredSnapshot,
  connection,
  restoreDatabase,
}) {
  const ok =
    sourceSnapshot.formatVersion === 3 &&
    restoredSnapshot.formatVersion === sourceSnapshot.formatVersion &&
    containsKnownData(sourceSnapshot) &&
    sourceSnapshot.checksum === restoredSnapshot.checksum &&
    JSON.stringify(sourceSnapshot.tables) === JSON.stringify(restoredSnapshot.tables);
  return {
    ok,
    formatVersion: 3,
    method: 'pg_dump/pg_restore + encrypted document objects',
    documentObjects: {
      source: sourceSnapshot.documentObjects,
      restored: restoredSnapshot.documentObjects,
    },
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
