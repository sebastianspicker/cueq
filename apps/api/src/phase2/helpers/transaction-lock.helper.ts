import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';

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

export async function lockClosingPeriodWrites(
  tx: TransactionLockClient,
  closingPeriodId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:closing-period-write:${closingPeriodId}`, {
    code: 'CLOSING_PERIOD_WRITE_IN_PROGRESS',
    message: 'Another write for this closing period is in progress.',
  });
}

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

export async function lockTerminalWrites(
  tx: TransactionLockClient,
  terminalId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:terminal-write:${terminalId}`, {
    code: 'TERMINAL_WRITE_IN_PROGRESS',
    message: 'Another update for this terminal is in progress.',
  });
}

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

export async function lockOrganizationRosterWrites(
  tx: TransactionLockClient,
  organizationUnitId: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:organization-roster-write:${organizationUnitId}`, {
    code: 'ORGANIZATION_ROSTER_WRITE_IN_PROGRESS',
    message: 'Another roster for this organization unit is being created.',
  });
}

export async function lockPolicyWrites(
  tx: TransactionLockClient,
  policyKey: string,
): Promise<void> {
  await acquireTransactionLock(tx, `cueq:policy-write:${policyKey}`, {
    code: 'POLICY_WRITE_IN_PROGRESS',
    message: 'Another version of this policy is being written.',
  });
}
