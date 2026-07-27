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

function classifyStoredSecret(
  row: WebhookEndpointSecretRow,
  previousEncryptionKey?: string,
): StoredSecretClassification {
  if (!row.secretRef) {
    throw new WebhookSecretMigrationError('invalid-state');
  }

  if (row.secretRef.startsWith(ENCRYPTED_WEBHOOK_SECRET_PREFIX)) {
    try {
      decryptWebhookSigningSecret(row.secretRef, row.id);
      return { kind: 'encrypted' };
    } catch (currentKeyError) {
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
  }

  if (LEGACY_WEBHOOK_SECRET_PATTERN.test(row.secretRef)) {
    return { kind: 'legacy', plaintext: row.secretRef };
  }

  throw new WebhookSecretMigrationError('invalid-state');
}

/** Audits, verifies, and optionally migrates secrets in one serializable transaction. */
export async function runWebhookSecretMigration(
  database: WebhookSecretMigrationDatabase,
  options: { dryRun: boolean; previousEncryptionKey?: string },
): Promise<WebhookSecretMigrationReport> {
  assertWebhookSecretEncryptionKey();
  if (options.previousEncryptionKey) {
    assertWebhookSecretEncryptionKey({
      WEBHOOK_SECRET_ENCRYPTION_KEY: options.previousEncryptionKey,
    });
  }

  return database.$transaction(
    async (transaction) => {
      const rows = await transaction.webhookEndpoint.findMany({
        select: { id: true, secretRef: true, isActive: true },
        orderBy: { id: 'asc' },
      });
      const rowsToMigrate: Array<{
        row: WebhookEndpointSecretRow & { secretRef: string };
        plaintext: string;
      }> = [];
      let alreadyEncrypted = 0;
      let legacyPlaintext = 0;
      let previousKeyEncrypted = 0;

      for (const row of rows) {
        const classification = classifyStoredSecret(row, options.previousEncryptionKey);
        if (classification.kind === 'encrypted') {
          alreadyEncrypted += 1;
        } else {
          if (classification.kind === 'legacy') {
            legacyPlaintext += 1;
          } else {
            previousKeyEncrypted += 1;
          }
          rowsToMigrate.push({
            row: row as WebhookEndpointSecretRow & { secretRef: string },
            plaintext: classification.plaintext,
          });
        }
      }

      const report: WebhookSecretMigrationReport = {
        dryRun: options.dryRun,
        total: rows.length,
        active: rows.filter((row) => row.isActive).length,
        alreadyEncrypted,
        legacyPlaintext,
        previousKeyEncrypted,
        migrated: 0,
      };

      if (options.dryRun) {
        return report;
      }

      for (const candidate of rowsToMigrate) {
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
        report.migrated += 1;
      }

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

      if (report.migrated > 0) {
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

      return report;
    },
    { isolationLevel: 'Serializable' },
  );
}
