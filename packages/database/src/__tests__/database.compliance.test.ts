import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('@cueq/database compliance', () => {
  it('keeps audit entries append-oriented (no updatedAt field)', () => {
    expect('updatedAt' in Prisma.AuditEntryScalarFieldEnum).toBe(false);
  });
});
