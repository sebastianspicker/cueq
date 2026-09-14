import { describe, expect, it, vi } from 'vitest';
import { InboxNotificationsService } from './inbox-notifications.service.js';

describe('InboxNotificationsService', () => {
  it('writes bounded batches and preserves deduplication', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const notifications = Array.from({ length: 1_001 }, (_, index) => ({
      recipientId: `person-${index}`,
      resourceType: 'LifecycleTask' as const,
      resourceId: `task-${index}`,
      messageCode: 'TASK_ASSIGNED' as const,
      dedupeKey: `task-${index}`,
    }));

    await new InboxNotificationsService().append(
      { inboxNotification: { createMany } } as never,
      notifications,
    );

    expect(createMany).toHaveBeenCalledTimes(3);
    expect(createMany.mock.calls.map(([input]) => input.data.length)).toEqual([500, 500, 1]);
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });
});
