import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

import { prisma } from '../index.js';

describe('@cueq/database integration', () => {
  it('can execute a raw connectivity query', async () => {
    const result = await prisma.$queryRaw<{ value: number }[]>`SELECT 1::int as value`;
    expect(result[0]?.value).toBe(1);
  });

  it.each(['update', 'delete'] as const)('rejects audit-entry %s operations', async (operation) => {
    const rollback = new Error('rollback audit-entry mutation test');

    await expect(
      prisma.$transaction(async (tx) => {
        const id = `audit-immutability-${randomUUID()}`;
        await tx.auditEntry.create({
          data: {
            id,
            actorId: 'test:audit-immutability',
            action: 'TEST_AUDIT_ENTRY_CREATED',
            entityType: 'DatabaseIntegrationTest',
            entityId: id,
          },
        });

        if (operation === 'update') {
          await expect(
            tx.auditEntry.update({
              where: { id },
              data: { action: 'TEST_AUDIT_ENTRY_MUTATED' },
            }),
          ).rejects.toThrow();
        } else {
          await expect(tx.auditEntry.delete({ where: { id } })).rejects.toThrow();
        }

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
