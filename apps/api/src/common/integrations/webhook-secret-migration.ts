/** Transactional migration of legacy webhook secrets with audit evidence and concurrent-write detection. */
import { buildAuditEntry } from '@cueq/core';
import {
  assertWebhookSecretEncryptionKey,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from './webhook-secret-envelope.js';

const LEGACY_WEBHOOK_SECRET_PATTERN = /^[0-9a-f]{64}$/u;
const ENCRYPTED_WEBHOOK_SECRET_PREFIX = 'v1.';

type WebhookEndpointSecretRow = {
  id: string;
  secretRef: string | null;
  isActive: boolean;
};

type WebhookSecretMigrationTransaction = {
  webhookEndpoint: {
    findMany(args: {
      where?: { isActive: boolean };
      select: { id: true; secretRef: true; isActive: true };
      orderBy: { id: 'asc' };
    }): Promise<WebhookEndpointSecretRow[]>;
    updateMany(args: {
      where: { id: string; secretRef: string };
      data: { secretRef: string };
    }): Promise<{ count: number }>;
  };
  auditEntry: {
    create(args: {
      data: {
        id: string;
        timestamp: Date;
        actorId: string;
        action: string;
        entityType: string;
        entityId: string;
        after: Record<string, number | boolean>;
        reason: string;
      };
    }): Promise<unknown>;
  };
};

/** Minimal database contract required to migrate secrets atomically. */
export type WebhookSecretMigrationDatabase = {
  $transaction<T>(
    callback: (transaction: WebhookSecretMigrationTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
};

/** Migration outcome suitable for machine-readable CLI output and audit metadata. */
export type WebhookSecretMigrationReport = {
  dryRun: boolean;
  total: number;
  active: number;
  alreadyEncrypted: number;
  legacyPlaintext: number;
  previousKeyEncrypted: number;
  migrated: number;
};

/** @internal Signals a migration condition that must abort the transaction. */
export class WebhookSecretMigrationError extends Error {
  constructor(reason: 'invalid-state' | 'concurrent-change' | 'verification-failed') {
    const messages = {
      'invalid-state': 'Webhook secret migration aborted because stored references are invalid.',
      'concurrent-change': 'Webhook secret migration aborted because endpoint state changed.',
      'verification-failed': 'Webhook secret migration verification failed.',
    } as const;
    super(messages[reason]);
  }
}

type StoredSecretClassification =
  | { kind: 'encrypted' }
  | { kind: 'legacy'; plaintext: string }
  | { kind: 'previous-key'; plaintext: string };

type SecretMigrationCandidate = {
  row: WebhookEndpointSecretRow & { secretRef: string };
  plaintext: string;
};

type SecretMigrationPlan = {
  report: WebhookSecretMigrationReport;
  candidates: SecretMigrationCandidate[];
};

function classifyStoredSecret(
  row: WebhookEndpointSecretRow,
  previousEncryptionKey?: string,
): StoredSecretClassification {
  if (!row.secretRef) {
    throw new WebhookSecretMigrationError('invalid-state');
  }
  const rowWithSecret = row as WebhookEndpointSecretRow & { secretRef: string };

  if (rowWithSecret.secretRef.startsWith(ENCRYPTED_WEBHOOK_SECRET_PREFIX)) {
    return classifyEncryptedSecret(rowWithSecret, previousEncryptionKey);
  }

  if (LEGACY_WEBHOOK_SECRET_PATTERN.test(rowWithSecret.secretRef)) {
    return { kind: 'legacy', plaintext: rowWithSecret.secretRef };
  }

  throw new WebhookSecretMigrationError('invalid-state');
}

function classifyEncryptedSecret(
  row: WebhookEndpointSecretRow & { secretRef: string },
  previousEncryptionKey?: string,
): StoredSecretClassification {
  try {
    decryptWebhookSigningSecret(row.secretRef, row.id);
    return { kind: 'encrypted' };
  } catch (currentKeyError) {
    return classifyWithPreviousKey(row, previousEncryptionKey, currentKeyError);
  }
}

function classifyWithPreviousKey(
  row: WebhookEndpointSecretRow & { secretRef: string },
  previousEncryptionKey: string | undefined,
  currentKeyError: unknown,
): StoredSecretClassification {
  if (!previousEncryptionKey) {
    throw currentKeyError;
  }

  try {
    return {
      kind: 'previous-key',
      plaintext: decryptWebhookSigningSecret(row.secretRef, row.id, {
        WEBHOOK_SECRET_ENCRYPTION_KEY: previousEncryptionKey,
      }),
    };
  } catch {
    throw currentKeyError;
  }
}

function validateEncryptionKeys(previousEncryptionKey?: string): void {
  assertWebhookSecretEncryptionKey();
  if (previousEncryptionKey) {
    assertWebhookSecretEncryptionKey({
      WEBHOOK_SECRET_ENCRYPTION_KEY: previousEncryptionKey,
    });
  }
}

function createMigrationPlan(
  rows: WebhookEndpointSecretRow[],
  options: { dryRun: boolean; previousEncryptionKey?: string },
): SecretMigrationPlan {
  const candidates: SecretMigrationCandidate[] = [];
  let alreadyEncrypted = 0;
  let legacyPlaintext = 0;
  let previousKeyEncrypted = 0;

  for (const row of rows) {
    const classification = classifyStoredSecret(row, options.previousEncryptionKey);
    if (classification.kind === 'encrypted') {
      alreadyEncrypted += 1;
      continue;
    }

    if (classification.kind === 'legacy') {
      legacyPlaintext += 1;
    } else {
      previousKeyEncrypted += 1;
    }
    candidates.push({
      row: row as WebhookEndpointSecretRow & { secretRef: string },
      plaintext: classification.plaintext,
    });
  }

  return {
    candidates,
    report: {
      dryRun: options.dryRun,
      total: rows.length,
      active: rows.filter((row) => row.isActive).length,
      alreadyEncrypted,
      legacyPlaintext,
      previousKeyEncrypted,
      migrated: 0,
    },
  };
}

async function migrateCandidates(
  transaction: WebhookSecretMigrationTransaction,
  candidates: SecretMigrationCandidate[],
): Promise<number> {
  let migrated = 0;

  for (const candidate of candidates) {
    const encrypted = encryptWebhookSigningSecret(candidate.plaintext, candidate.row.id);
    if (decryptWebhookSigningSecret(encrypted, candidate.row.id) !== candidate.plaintext) {
      throw new WebhookSecretMigrationError('verification-failed');
    }

    const updated = await transaction.webhookEndpoint.updateMany({
      where: { id: candidate.row.id, secretRef: candidate.row.secretRef },
      data: { secretRef: encrypted },
    });
    if (updated.count !== 1) {
      throw new WebhookSecretMigrationError('concurrent-change');
    }
    migrated += 1;
  }

  return migrated;
}

async function verifyActiveSecrets(transaction: WebhookSecretMigrationTransaction): Promise<void> {
  const activeRows = await transaction.webhookEndpoint.findMany({
    where: { isActive: true },
    select: { id: true, secretRef: true, isActive: true },
    orderBy: { id: 'asc' },
  });

  for (const row of activeRows) {
    if (!row.secretRef || !row.secretRef.startsWith(ENCRYPTED_WEBHOOK_SECRET_PREFIX)) {
      throw new WebhookSecretMigrationError('verification-failed');
    }
    decryptWebhookSigningSecret(row.secretRef, row.id);
  }
}

async function createMigrationAudit(
  transaction: WebhookSecretMigrationTransaction,
  report: WebhookSecretMigrationReport,
): Promise<void> {
  if (report.migrated === 0) {
    return;
  }

  const audit = buildAuditEntry({
    actorId: 'system:webhook-secret-migration',
    action: 'WEBHOOK_SECRETS_ENCRYPTED',
    entityType: 'WebhookEndpoint',
    entityId: 'bulk',
    after: report,
    reason: 'Encrypt legacy webhook signing secrets at rest',
  });
  await transaction.auditEntry.create({
    data: {
      id: audit.id,
      timestamp: new Date(audit.timestamp),
      actorId: audit.actorId,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      after: report,
      reason: audit.reason ?? 'Encrypt legacy webhook signing secrets at rest',
    },
  });
}

/** Audits, verifies, and optionally migrates secrets in one serializable transaction. */
export async function runWebhookSecretMigration(
  database: WebhookSecretMigrationDatabase,
  options: { dryRun: boolean; previousEncryptionKey?: string },
): Promise<WebhookSecretMigrationReport> {
  validateEncryptionKeys(options.previousEncryptionKey);

  return database.$transaction(
    async (transaction) => {
      const rows = await transaction.webhookEndpoint.findMany({
        select: { id: true, secretRef: true, isActive: true },
        orderBy: { id: 'asc' },
      });
      const plan = createMigrationPlan(rows, options);

      if (options.dryRun) {
        return plan.report;
      }

      const report = {
        ...plan.report,
        migrated: await migrateCandidates(transaction, plan.candidates),
      };
      await verifyActiveSecrets(transaction);
      await createMigrationAudit(transaction, report);

      return report;
    },
    { isolationLevel: 'Serializable' },
  );
}
