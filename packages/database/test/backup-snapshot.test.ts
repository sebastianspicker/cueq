import { describe, expect, it } from 'vitest';
// JavaScript database tooling is exercised through its public runner boundary.
// @ts-expect-error JavaScript tooling has no declaration file.
import { snapshot } from '../scripts/backup-restore/snapshot.mjs';
import { Prisma } from '@prisma/client';

function database(rows: Array<Record<string, unknown>>) {
  const requests: Array<{ take: number; cursor?: { id: string }; skip?: number }> = [];
  const table = {
    findMany: async (query: (typeof requests)[number]) => {
      requests.push(query);
      const start = query.cursor ? rows.findIndex((r) => r.id === query.cursor?.id) + 1 : 0;
      return rows.slice(start, start + query.take);
    },
  };
  return {
    requests,
    prisma: {
      $transaction: async (run: (db: unknown) => Promise<unknown>) => run({ person: table }),
    },
  };
}

describe('incremental canonical snapshot v3', () => {
  it('traverses bounded pages including exactly full pages without retaining records', async () => {
    const rows = Array.from({ length: 1501 }, (_, index) => ({
      id: String(index).padStart(6, '0'),
      value: { b: 1, a: index },
    }));
    const db = database(rows);
    const result = await snapshot(db.prisma, [{ name: 'Person', client: 'person' }]);
    expect(db.requests).toHaveLength(4);
    expect(db.requests.every((q) => q.take === 500)).toBe(true);
    expect(result.tables.Person).toBe(1501);
    expect(result).not.toHaveProperty('data');
    const reordered = database(
      rows.map((r) => ({ value: { a: (r.value as { a: number }).a, b: 1 }, id: r.id })),
    );
    expect(
      (await snapshot(reordered.prisma, [{ name: 'Person', client: 'person' }])).checksum,
    ).toBe(result.checksum);
    rows[1500]!.value = { a: -1, b: 1 };
    expect(
      (await snapshot(database(rows).prisma, [{ name: 'Person', client: 'person' }])).checksum,
    ).not.toBe(result.checksum);
  });
  it('discovers every generated persisted model, including previously omitted tables', async () => {
    const names: string[] = [];
    const tx = Object.fromEntries(
      Prisma.dmmf.datamodel.models.map((model) => [
        model.name[0]!.toLowerCase() + model.name.slice(1),
        {
          findMany: async () => {
            names.push(model.name);
            return [];
          },
        },
      ]),
    );
    const result = await snapshot({
      $transaction: async (run: (db: unknown) => unknown) => run(tx),
    });
    expect(names).toHaveLength(Prisma.dmmf.datamodel.models.length);
    expect(result.tables).toHaveProperty('ShiftAssignment', 0);
    expect(result.tables).toHaveProperty('TimeThresholdPolicy', 0);
    expect(result.tables).toHaveProperty('WebhookDispatchJobItem', 0);
  });
  it('includes verified document objects and refuses a missing or corrupt object', async () => {
    const row = {
      id: 'version',
      objectKey: 'object.enc',
      checksum: 'plain',
      encryptedChecksum: 'encrypted',
      sizeBytes: 7,
    };
    const reads: unknown[] = [];
    const copies: unknown[] = [];
    const prisma = {
      $transaction: async (run: (db: unknown) => unknown) =>
        run({ personnelDocumentVersion: { findMany: async () => [row] } }),
    };
    const options = {
      documentStorage: {
        read: async (entry: unknown) => {
          reads.push(entry);
        },
        copyVerifiedTo: async (entry: unknown, root: string) => {
          copies.push([entry, root]);
        },
      },
      documentCopyRoot: '/synthetic-backup',
    };
    const models = [{ name: 'PersonnelDocumentVersion', client: 'personnelDocumentVersion' }];
    const result = await snapshot(prisma, models, options);
    expect(result.formatVersion).toBe(3);
    expect(result.documentObjects.count).toBe(1);
    expect(reads).toEqual([row]);
    expect(copies).toEqual([[row, '/synthetic-backup']]);
    await expect(
      snapshot(prisma, models, {
        documentStorage: {
          read: async () => {
            throw new Error('DOCUMENT_CHECKSUM_MISMATCH');
          },
        },
      }),
    ).rejects.toThrow('DOCUMENT_CHECKSUM_MISMATCH');
  });
});
