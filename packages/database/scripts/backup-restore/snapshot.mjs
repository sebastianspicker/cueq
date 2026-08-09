import { createHash } from 'node:crypto';

const TABLES = [
  ['organizationUnits', 'organizationUnit'],
  ['workTimeModels', 'workTimeModel'],
  ['persons', 'person'],
  ['timeTypes', 'timeType'],
  ['rosters', 'roster'],
  ['shifts', 'shift'],
  ['bookings', 'booking'],
  ['absences', 'absence'],
  ['leaveAdjustments', 'leaveAdjustment'],
  ['onCallRotations', 'onCallRotation'],
  ['onCallDeployments', 'onCallDeployment'],
  ['workflowInstances', 'workflowInstance'],
  ['workflowPolicies', 'workflowPolicy'],
  ['workflowDelegationRules', 'workflowDelegationRule'],
  ['closingPeriods', 'closingPeriod'],
  ['exportRuns', 'exportRun'],
  ['domainEventOutbox', 'domainEventOutbox'],
  ['webhookEndpoints', 'webhookEndpoint'],
  ['webhookDeliveries', 'webhookDelivery'],
  ['terminalDevices', 'terminalDevice'],
  ['terminalHeartbeats', 'terminalHeartbeat'],
  ['terminalSyncBatches', 'terminalSyncBatch'],
  ['hrImportRuns', 'hrImportRun'],
  ['timeAccounts', 'timeAccount'],
  ['auditEntries', 'auditEntry'],
];

function checksum(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function sortById(rows) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export async function snapshot(prisma) {
  const rows = await Promise.all(TABLES.map(([, client]) => prisma[client].findMany()));
  const data = Object.fromEntries(TABLES.map(([name], index) => [name, sortById(rows[index])]));
  const tables = Object.fromEntries(
    Object.entries(data).map(([name, values]) => [name, values.length]),
  );
  return { data, tables, checksum: checksum(data) };
}

export async function captureStableDump({
  source,
  snapshotSource = snapshot,
  dumpSource,
  connection,
  tempDir,
  dumpPath,
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await snapshotSource(source);
    dumpSource(connection, tempDir, dumpPath);
    const after = await snapshotSource(source);
    if (before.checksum === after.checksum) return after;
  }
  throw new Error('SOURCE_CHANGED_DURING_BACKUP');
}
