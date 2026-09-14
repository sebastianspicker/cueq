import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { DocumentRecoveryService } from './document-recovery.service.js';

function fixture(versionExists = false) {
  const events: string[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 'upload' }]),
    documentUpload: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'upload',
        status: 'PENDING',
        objectKey: 'object.enc',
        cleanupAt: null,
      })),
      update: vi.fn(async () => {
        events.push('state');
      }),
    },
    personnelDocumentVersion: {
      findUnique: vi.fn(async () => (versionExists ? { id: 'version' } : null)),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => {
      const result = await run(tx);
      events.push('commit');
      return result;
    }),
  };
  const objects = {
    discardUnreferenced: vi.fn(async () => {
      events.push('discard');
    }),
  };
  return {
    tx,
    prisma,
    objects,
    events,
    service: new DocumentRecoveryService(prisma as unknown as PrismaService),
  };
}

describe('durable document upload recovery', () => {
  it('never discards an object referenced by a committed version', async () => {
    const f = fixture(true);
    await f.service.recoverOne('upload', f.objects);
    expect(f.objects.discardUnreferenced).not.toHaveBeenCalled();
    expect(f.tx.documentUpload.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMMITTED' }) }),
    );
  });
  it('commits failed state before discarding an abandoned staged object', async () => {
    const f = fixture();
    await f.service.recoverOne('upload', f.objects);
    expect(f.events.indexOf('commit')).toBeLessThan(f.events.indexOf('discard'));
    expect(f.objects.discardUnreferenced).toHaveBeenCalledWith('object.enc');
  });
  it('keeps bytes intact on an ambiguous recovery commit and skips a locked upload', async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValueOnce(new Error('connection lost during commit'));
    await expect(f.service.recoverOne('upload', f.objects)).rejects.toThrow('connection lost');
    expect(f.objects.discardUnreferenced).not.toHaveBeenCalled();
    f.tx.$queryRaw.mockResolvedValueOnce([]);
    await f.service.recoverOne('upload', f.objects);
    expect(f.objects.discardUnreferenced).not.toHaveBeenCalled();
  });
  it('keeps a missing staged path eligible so a delayed writer cannot leave a permanent orphan', async () => {
    const f = fixture();
    f.objects.discardUnreferenced.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );
    await f.service.recoverOne('upload', f.objects);
    expect(f.tx.documentUpload.update.mock.calls).toHaveLength(1);
    expect(f.tx.documentUpload.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cleanupAt: expect.any(Date) }) }),
    );
    // A late writer creates the path after that pass; the same intent is retried.
    await f.service.recoverOne('upload', f.objects);
    expect(f.objects.discardUnreferenced).toHaveBeenCalledTimes(2);
    expect(f.tx.documentUpload.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cleanupAt: expect.any(Date) }) }),
    );
  });
});
