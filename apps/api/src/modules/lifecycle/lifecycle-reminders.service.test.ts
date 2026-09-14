import { afterEach, expect, it, vi } from 'vitest';
import { LifecycleRemindersService } from './lifecycle-reminders.service.js';

afterEach(() => vi.useRealTimers());
it('retries due tasks with stable recipient keys and skips tasks completed since the scan', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-29T22:30:00Z'));
  const task = {
    id: 'task',
    status: 'OPEN',
    dueDate: new Date('2026-03-30T00:00:00Z'),
    responsiblePersonId: 'person',
    responsibleGroupId: null,
  };
  const tx = { lifecycleTask: { findUnique: vi.fn().mockResolvedValue(task) } };
  const prisma = {
    lifecycleTask: { findMany: vi.fn().mockResolvedValue([{ id: task.id }]) },
    $transaction: vi.fn(async (run) => run(tx)),
  };
  const notifications = { append: vi.fn() };
  const service = new LifecycleRemindersService(prisma as never, notifications);
  await service.poll();
  await service.poll();
  expect(notifications.append.mock.calls[0]).toEqual(notifications.append.mock.calls[1]);
  expect(notifications.append).toHaveBeenCalledWith(tx, [
    {
      recipientId: 'person',
      resourceType: 'LifecycleTask',
      resourceId: 'task',
      messageCode: 'TASK_DUE',
      dedupeKey: 'task-due:task:2026-03-30T00:00:00.000Z:person',
    },
  ]);
  tx.lifecycleTask.findUnique.mockResolvedValueOnce({ ...task, status: 'DONE' });
  await service.poll();
  expect(notifications.append).toHaveBeenCalledTimes(2);
  expect(prisma.lifecycleTask.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: 100 }),
  );
});
