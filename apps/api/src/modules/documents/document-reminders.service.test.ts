import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentRemindersService } from './document-reminders.service.js';

function fixture() {
  const document = {
    id: 'document',
    personId: 'person',
    expiresAt: new Date('2026-09-08T00:00:00Z'),
  };
  const tx = {
    personnelDocument: { findUnique: vi.fn().mockResolvedValue(document) },
    personnelDocumentVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'version' }) },
  };
  const prisma = {
    personnelDocument: { findMany: vi.fn().mockResolvedValue([{ id: document.id }]) },
    $transaction: vi.fn(async (run) => run(tx)),
  };
  const notifications = { append: vi.fn() };
  return {
    tx,
    prisma,
    notifications,
    service: new DocumentRemindersService(prisma as never, notifications),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('private document expiry reminders', () => {
  it('uses a stable deduplication key across retries and contains no document metadata', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_ROOT', '/configured/private');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    const f = fixture();
    await f.service.poll();
    await f.service.poll();
    expect(f.notifications.append).toHaveBeenCalledTimes(2);
    expect(f.notifications.append.mock.calls[0]).toEqual(f.notifications.append.mock.calls[1]);
    expect(f.notifications.append).toHaveBeenCalledWith(f.tx, [
      {
        recipientId: 'person',
        resourceType: 'PersonnelDocument',
        resourceId: 'document',
        messageCode: 'DOCUMENT_EXPIRING',
        dedupeKey: 'document-expiry:document:2026-09-08T00:00:00.000Z',
      },
    ]);
    expect(f.prisma.personnelDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, select: { id: true } }),
    );
  });
  it('requires configured storage and rechecks current expiry and content before enqueueing', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_ROOT', '');
    const f = fixture();
    await f.service.poll();
    expect(f.prisma.personnelDocument.findMany).not.toHaveBeenCalled();
    vi.stubEnv('DOCUMENT_STORAGE_ROOT', '/configured/private');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    f.tx.personnelDocumentVersion.findFirst.mockResolvedValueOnce(null);
    await f.service.poll();
    expect(f.notifications.append).not.toHaveBeenCalled();
    f.tx.personnelDocument.findUnique.mockResolvedValueOnce({
      id: 'document',
      personId: 'person',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    await f.service.poll();
    expect(f.notifications.append).not.toHaveBeenCalled();
  });
});
