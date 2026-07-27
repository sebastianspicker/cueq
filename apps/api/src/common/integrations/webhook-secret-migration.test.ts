import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from './webhook-secret-envelope.js';
import {
  runWebhookSecretMigration,
  WebhookSecretMigrationError,
  type WebhookSecretMigrationDatabase,
} from './webhook-secret-migration.js';

const TEST_KEY = Buffer.alloc(32, 14).toString('base64');
const LEGACY_SECRET = 'a'.repeat(64);

type Row = { id: string; secretRef: string | null; isActive: boolean };

function databaseFixture(initialRows: Row[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const auditEntry = { create: vi.fn().mockResolvedValue(undefined) };
  const webhookEndpoint = {
    findMany: vi.fn().mockImplementation(({ where }: { where?: { isActive: boolean } }) =>
      Promise.resolve(
        rows
          .filter((row) => where?.isActive === undefined || row.isActive === where.isActive)
          .map((row) => ({ ...row }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    ),
    updateMany: vi
      .fn()
      .mockImplementation(
        ({
          where,
          data,
        }: {
          where: { id: string; secretRef: string };
          data: { secretRef: string };
        }) => {
          const row = rows.find(
            (candidate) => candidate.id === where.id && candidate.secretRef === where.secretRef,
          );
          if (!row) {
            return Promise.resolve({ count: 0 });
          }
          row.secretRef = data.secretRef;
          return Promise.resolve({ count: 1 });
        },
      ),
  };
  const transaction = { webhookEndpoint, auditEntry };
  const database = {
    $transaction: vi.fn().mockImplementation((callback) => callback(transaction)),
  } as unknown as WebhookSecretMigrationDatabase;

  return { database, rows, webhookEndpoint, auditEntry };
}

beforeEach(() => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY;
});

describe('runWebhookSecretMigration', () => {
  it('inventories legacy and encrypted rows without writing during a dry run', async () => {
    const encrypted = encryptWebhookSigningSecret('b'.repeat(64), 'endpoint-2');
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
      { id: 'endpoint-2', secretRef: encrypted, isActive: false },
    ]);

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: true })).resolves.toEqual({
      dryRun: true,
      total: 2,
      active: 1,
      alreadyEncrypted: 1,
      legacyPlaintext: 1,
      previousKeyEncrypted: 0,
      migrated: 0,
    });
    expect(fixture.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
  });

  it('encrypts legacy rows atomically, verifies active rows, audits counts, and is idempotent', async () => {
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
    ]);

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).resolves.toEqual({
      dryRun: false,
      total: 1,
      active: 1,
      alreadyEncrypted: 0,
      legacyPlaintext: 1,
      previousKeyEncrypted: 0,
      migrated: 1,
    });
    const stored = fixture.rows[0]?.secretRef;
    expect(stored).toMatch(/^v1\./u);
    expect(stored).not.toContain(LEGACY_SECRET);
    expect(decryptWebhookSigningSecret(stored as string, 'endpoint-1')).toBe(LEGACY_SECRET);
    expect(fixture.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'system:webhook-secret-migration',
        action: 'WEBHOOK_SECRETS_ENCRYPTED',
        after: expect.objectContaining({ migrated: 1, legacyPlaintext: 1 }),
      }),
    });
    expect(fixture.database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });

    await expect(
      runWebhookSecretMigration(fixture.database, { dryRun: false }),
    ).resolves.toMatchObject({
      alreadyEncrypted: 1,
      legacyPlaintext: 0,
      migrated: 0,
    });
    expect(fixture.webhookEndpoint.updateMany).toHaveBeenCalledTimes(1);
    expect(fixture.auditEntry.create).toHaveBeenCalledTimes(1);
  });

  it('re-encrypts an envelope from an explicitly supplied previous key', async () => {
    const previousKey = Buffer.alloc(32, 15).toString('base64');
    const envelope = encryptWebhookSigningSecret('c'.repeat(64), 'endpoint-1', {
      WEBHOOK_SECRET_ENCRYPTION_KEY: previousKey,
    });
    const fixture = databaseFixture([{ id: 'endpoint-1', secretRef: envelope, isActive: true }]);

    await expect(
      runWebhookSecretMigration(fixture.database, {
        dryRun: false,
        previousEncryptionKey: previousKey,
      }),
    ).resolves.toMatchObject({
      alreadyEncrypted: 0,
      legacyPlaintext: 0,
      previousKeyEncrypted: 1,
      migrated: 1,
    });

    const stored = fixture.rows[0]?.secretRef as string;
    expect(decryptWebhookSigningSecret(stored, 'endpoint-1')).toBe('c'.repeat(64));
    expect(() =>
      decryptWebhookSigningSecret(stored, 'endpoint-1', {
        WEBHOOK_SECRET_ENCRYPTION_KEY: previousKey,
      }),
    ).toThrow('Webhook signing secret unavailable.');
  });

  it.each([
    ['null reference', null],
    ['unknown plaintext', 'receiver-managed-secret'],
    ['unknown envelope version', 'v2.a.b.c'],
  ])('aborts without writes for %s', async (_label, secretRef) => {
    const fixture = databaseFixture([{ id: 'endpoint-1', secretRef, isActive: true }]);

    await expect(
      runWebhookSecretMigration(fixture.database, { dryRun: false }),
    ).rejects.toBeInstanceOf(WebhookSecretMigrationError);
    expect(fixture.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
  });

  it('aborts without writes when an encrypted row cannot be opened by the configured key', async () => {
    const envelope = encryptWebhookSigningSecret('d'.repeat(64), 'endpoint-1', {
      WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 15).toString('base64'),
    });
    const fixture = databaseFixture([{ id: 'endpoint-1', secretRef: envelope, isActive: true }]);

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).rejects.toThrow(
      'Webhook signing secret unavailable.',
    );
    expect(fixture.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
  });
});
