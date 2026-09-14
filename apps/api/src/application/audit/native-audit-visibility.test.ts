import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@cueq/database';
import { nativeAuditVisibilityWhere } from './native-audit-visibility.js';

describe('private HR audit visibility', () => {
  it('requires explicit global capability instead of relying on an existing audit role', async () => {
    const tx = { capabilityGrant: { groupBy: vi.fn(async () => []) } };
    const denied = await nativeAuditVisibilityWhere(
      tx as unknown as Prisma.TransactionClient,
      'actor',
    );
    expect(denied.OR).toContainEqual({ entityType: { in: [] } });
    expect(denied.OR).toContainEqual({
      entityType: {
        notIn: expect.arrayContaining(['PersonnelDocument', 'PersonnelDocumentVersion']),
      },
    });
  });
  it('permits only the native categories covered by the granted capability', async () => {
    const tx = {
      capabilityGrant: { groupBy: vi.fn(async () => [{ capability: 'documents.read' }]) },
    };
    const allowed = await nativeAuditVisibilityWhere(
      tx as unknown as Prisma.TransactionClient,
      'actor',
    );
    expect(allowed.OR).toContainEqual({
      entityType: { in: ['PersonnelDocument', 'PersonnelDocumentVersion', 'DocumentUpload'] },
    });
  });
});
