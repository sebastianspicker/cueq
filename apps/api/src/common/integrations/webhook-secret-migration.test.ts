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
  const auditEntries: unknown[] = [];
  const operations: string[] = [];
  let transactionRows: Row[] | undefined;
  let transactionAuditEntries: unknown[] | undefined;

  function currentRows(): Row[] {
    if (!transactionRows) {
      throw new Error('Database operation escaped the transaction.');
    }
    return transactionRows;
  }

  function currentAuditEntries(): unknown[] {
    if (!transactionAuditEntries) {
      throw new Error('Audit operation escaped the transaction.');
    }
    return transactionAuditEntries;
  }

  const findRows = ({ where }: { where?: { isActive: boolean } }) => {
    operations.push(where?.isActive ? 'active-read' : 'initial-read');
    return Promise.resolve(
      currentRows()
        .filter((row) => where?.isActive === undefined || row.isActive === where.isActive)
        .map((row) => ({ ...row }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  };
  const updateRow = ({
    where,
    data,
  }: {
    where: { id: string; secretRef: string };
    data: { secretRef: string };
  }) => {
    operations.push(`cas:${where.id}`);
    const row = currentRows().find(
      (candidate) => candidate.id === where.id && candidate.secretRef === where.secretRef,
    );
    if (!row) {
      return Promise.resolve({ count: 0 });
    }
    row.secretRef = data.secretRef;
    return Promise.resolve({ count: 1 });
  };
  const recordAudit = (args: unknown) => {
    operations.push('audit');
    currentAuditEntries().push(args);
    return Promise.resolve(undefined);
  };

  const auditEntry = { create: vi.fn().mockImplementation(recordAudit) };
  const webhookEndpoint = {
    findMany: vi.fn().mockImplementation(findRows),
    updateMany: vi.fn().mockImplementation(updateRow),
  };
  const transaction = { webhookEndpoint, auditEntry };
  const database = {
    $transaction: vi.fn().mockImplementation(async (callback) => {
      transactionRows = rows.map((row) => ({ ...row }));
      transactionAuditEntries = [];
      try {
        const result = await callback(transaction);
        rows.splice(0, rows.length, ...transactionRows.map((row) => ({ ...row })));
        auditEntries.push(...transactionAuditEntries);
        return result;
      } finally {
        transactionRows = undefined;
        transactionAuditEntries = undefined;
      }
    }),
  } as unknown as WebhookSecretMigrationDatabase;

  return {
    database,
    rows,
    auditEntries,
    operations,
    findRows,
    updateRow,
    webhookEndpoint,
    auditEntry,
  };
}

beforeEach(() => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY;
});

describe('runWebhookSecretMigration', () => {
  it.each([
    { currentKey: 'invalid-key', previousEncryptionKey: undefined },
    { currentKey: TEST_KEY, previousEncryptionKey: 'invalid-key' },
  ])(
    'validates configured keys before starting the transaction',
    async ({ currentKey, previousEncryptionKey }) => {
      process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = currentKey;
      const fixture = databaseFixture([
        { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
      ]);

      await expect(
        runWebhookSecretMigration(fixture.database, { dryRun: false, previousEncryptionKey }),
      ).rejects.toThrow('Webhook signing secret unavailable.');
      expect(fixture.database.$transaction).not.toHaveBeenCalled();
    },
  );

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

  it('classifies every row before migrating any legacy secret', async () => {
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
      { id: 'endpoint-2', secretRef: 'receiver-managed-secret', isActive: true },
    ]);

    await expect(
      runWebhookSecretMigration(fixture.database, { dryRun: false }),
    ).rejects.toBeInstanceOf(WebhookSecretMigrationError);
    expect(fixture.webhookEndpoint.updateMany).not.toHaveBeenCalled();
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
  });

  it('rolls back prior candidate updates when a later CAS detects a concurrent change', async () => {
    const legacySecretTwo = 'b'.repeat(64);
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
      { id: 'endpoint-2', secretRef: legacySecretTwo, isActive: true },
    ]);
    fixture.webhookEndpoint.updateMany
      .mockImplementationOnce(fixture.updateRow)
      .mockImplementationOnce(({ where }: { where: { id: string } }) => {
        fixture.operations.push(`cas:${where.id}`);
        return Promise.resolve({ count: 0 });
      });

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).rejects.toThrow(
      'Webhook secret migration aborted because endpoint state changed.',
    );

    expect(fixture.webhookEndpoint.updateMany).toHaveBeenCalledTimes(2);
    expect(fixture.operations).toEqual(['initial-read', 'cas:endpoint-1', 'cas:endpoint-2']);
    expect(fixture.rows).toEqual([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
      { id: 'endpoint-2', secretRef: legacySecretTwo, isActive: true },
    ]);
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
    expect(fixture.auditEntries).toEqual([]);
  });

  it('rolls back migrated secrets when the active re-read is invalid', async () => {
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
    ]);
    fixture.webhookEndpoint.findMany
      .mockImplementationOnce(fixture.findRows)
      .mockImplementationOnce(({ where }: { where?: { isActive: boolean } }) => {
        expect(where).toEqual({ isActive: true });
        fixture.operations.push('active-read');
        return Promise.resolve([{ id: 'endpoint-1', secretRef: null, isActive: true }]);
      });

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).rejects.toThrow(
      'Webhook secret migration verification failed.',
    );

    expect(fixture.operations).toEqual(['initial-read', 'cas:endpoint-1', 'active-read']);
    expect(fixture.rows).toEqual([{ id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true }]);
    expect(fixture.auditEntry.create).not.toHaveBeenCalled();
    expect(fixture.auditEntries).toEqual([]);
  });

  it('rolls back migrated secrets when audit creation rejects', async () => {
    const fixture = databaseFixture([
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
    ]);
    const auditFailure = new Error('audit storage unavailable');
    fixture.auditEntry.create.mockRejectedValueOnce(auditFailure);

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).rejects.toBe(
      auditFailure,
    );

    expect(fixture.operations).toEqual(['initial-read', 'cas:endpoint-1', 'active-read']);
    expect(fixture.auditEntry.create).toHaveBeenCalledTimes(1);
    expect(fixture.rows).toEqual([{ id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true }]);
    expect(fixture.auditEntries).toEqual([]);
  });

  it('orders reads, CAS writes, verification, and audit while retaining only the report', async () => {
    const legacySecretTwo = 'b'.repeat(64);
    const fixture = databaseFixture([
      { id: 'endpoint-2', secretRef: legacySecretTwo, isActive: true },
      { id: 'endpoint-1', secretRef: LEGACY_SECRET, isActive: true },
    ]);
    const expectedReport = {
      dryRun: false,
      total: 2,
      active: 2,
      alreadyEncrypted: 0,
      legacyPlaintext: 2,
      previousKeyEncrypted: 0,
      migrated: 2,
    };

    await expect(runWebhookSecretMigration(fixture.database, { dryRun: false })).resolves.toEqual(
      expectedReport,
    );

    expect(fixture.operations).toEqual([
      'initial-read',
      'cas:endpoint-1',
      'cas:endpoint-2',
      'active-read',
      'audit',
    ]);
    expect(fixture.webhookEndpoint.findMany).toHaveBeenNthCalledWith(1, {
      select: { id: true, secretRef: true, isActive: true },
      orderBy: { id: 'asc' },
    });
    expect(fixture.webhookEndpoint.findMany).toHaveBeenNthCalledWith(2, {
      where: { isActive: true },
      select: { id: true, secretRef: true, isActive: true },
      orderBy: { id: 'asc' },
    });
    expect(fixture.webhookEndpoint.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'endpoint-1', secretRef: LEGACY_SECRET },
      data: { secretRef: expect.stringMatching(/^v1\./u) },
    });
    expect(fixture.webhookEndpoint.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'endpoint-2', secretRef: legacySecretTwo },
      data: { secretRef: expect.stringMatching(/^v1\./u) },
    });

    const auditPayload = fixture.auditEntry.create.mock.calls[0]?.[0];
    expect(auditPayload).toEqual({
      data: {
        id: expect.any(String),
        timestamp: expect.any(Date),
        actorId: 'system:webhook-secret-migration',
        action: 'WEBHOOK_SECRETS_ENCRYPTED',
        entityType: 'WebhookEndpoint',
        entityId: 'bulk',
        after: expectedReport,
        reason: 'Encrypt legacy webhook signing secrets at rest',
      },
    });
    expect(fixture.auditEntries).toEqual([auditPayload]);
    const serializedAudit = JSON.stringify(auditPayload);
    expect(serializedAudit).not.toContain(LEGACY_SECRET);
    expect(serializedAudit).not.toContain(legacySecretTwo);
    for (const row of fixture.rows) {
      expect(serializedAudit).not.toContain(row.secretRef as string);
      expect(decryptWebhookSigningSecret(row.secretRef as string, row.id)).toBe(
        row.id === 'endpoint-1' ? LEGACY_SECRET : legacySecretTwo,
      );
    }
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
