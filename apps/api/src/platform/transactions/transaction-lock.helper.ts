/** Provides transaction-scoped PostgreSQL advisory locks for concurrent mutations. */
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';

/** PostgreSQL advisory-lock primitives. Callers must acquire shared scopes in their documented order. */
type TransactionLockClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

async function acquireTransactionLock(
  tx: TransactionLockClient,
  key: string,
  conflict: { code: string; message: string },
): Promise<void> {
  const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS acquired
  `;

  if (!lock?.acquired) {
    throw new ConflictException({
      ...conflict,
      retryable: true,
    });
  }
}

/**
 * Serializes mutations affecting one or more people. IDs are sorted to prevent lock-order deadlocks.
 */
export async function lockPersonWrites(
  tx: TransactionLockClient,
  personIds: Iterable<string>,
): Promise<void> {
  const sortedPersonIds = [...new Set(personIds)].sort((left, right) => left.localeCompare(right));

  for (const personId of sortedPersonIds) {
    await acquireTransactionLock(tx, `cueq:person-write:${personId}`, {
      code: 'PERSON_WRITE_IN_PROGRESS',
      message: 'Another time or absence write for this person is in progress.',
    });
  }
}

/** Acquires the closing-period mutation barrier for the lifetime of the current transaction. */
export async function lockClosingPeriodWrites(
  tx: TransactionLockClient,
  closingPeriodId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:closing-period-write:${closingPeriodId}`, {
    code: 'CLOSING_PERIOD_WRITE_IN_PROGRESS',
    message: 'Another write for this closing period is in progress.',
  });
}

/**
 * Serializes one terminal/checksum pair so retrying the same batch cannot create a parallel ingestion run.
 */
export async function lockTerminalIngestion(
  tx: TransactionLockClient,
  terminalId: string,
  ingestionChecksum: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:terminal-ingestion:${terminalId}:${ingestionChecksum}`, {
    code: 'TERMINAL_INGESTION_IN_PROGRESS',
    message: 'This terminal batch is already being imported.',
  });
}

/** Serializes terminal metadata and heartbeat updates independently of a specific import batch. */
export async function lockTerminalWrites(
  tx: TransactionLockClient,
  terminalId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:terminal-write:${terminalId}`, {
    code: 'TERMINAL_WRITE_IN_PROGRESS',
    message: 'Another update for this terminal is in progress.',
  });
}

/**
 * Serializes mutations across one or more rosters. IDs are sorted to prevent lock-order deadlocks.
 */
export async function lockRosterWrites(
  tx: TransactionLockClient,
  rosterIds: Iterable<string>,
): Promise<void> {
  const sortedRosterIds = [...new Set(rosterIds)].sort((left, right) => left.localeCompare(right));

  for (const rosterId of sortedRosterIds) {
    await acquireTransactionLock(tx, `cueq:roster-write:${rosterId}`, {
      code: 'ROSTER_WRITE_IN_PROGRESS',
      message: 'Another write for this roster is in progress.',
    });
  }
}

/** Prevents concurrent roster creation for the same organization unit. */
export async function lockOrganizationRosterWrites(
  tx: TransactionLockClient,
  organizationUnitId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:organization-roster-write:${organizationUnitId}`, {
    code: 'ORGANIZATION_ROSTER_WRITE_IN_PROGRESS',
    message: 'Another roster for this organization unit is being created.',
  });
}

/** Serializes activation or replacement of a logical policy version. */
export async function lockPolicyWrites(
  tx: TransactionLockClient,
  policyKey: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:policy-write:${policyKey}`, {
    code: 'POLICY_WRITE_IN_PROGRESS',
    message: 'Another version of this policy is being written.',
  });
}
