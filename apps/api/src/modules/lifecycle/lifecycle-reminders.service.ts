/** Date-triggered task reminders with finite reads and durable recipient deduplication. */
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../persistence/prisma.service.js';
import {
  INBOX_NOTIFICATIONS_PORT,
  type InboxNotificationsPort,
} from '../../application/ports/inbox-notifications.port.js';
import { lifecycleToday } from './lifecycle-date.js';

@Injectable()
export class LifecycleRemindersService implements OnApplicationBootstrap {
  private running = false;
  private cursor: string | undefined;
  private readonly logger = new Logger(LifecycleRemindersService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(INBOX_NOTIFICATIONS_PORT) private readonly notifications: InboxNotificationsPort,
  ) {}
  onApplicationBootstrap() {
    void this.poll();
  }
  @Interval(30_000)
  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      const today = lifecycleToday();
      const tasks = await this.prisma.lifecycleTask.findMany({
        where: {
          status: 'OPEN',
          dueDate: { lte: today },
          ...(this.cursor ? { id: { gt: this.cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const item of tasks)
        await this.prisma.$transaction(async (tx) => {
          const task = await tx.lifecycleTask.findUnique({ where: { id: item.id } });
          if (!task || task.status !== 'OPEN' || task.dueDate > today) return;
          const recipients = task.responsiblePersonId
            ? [task.responsiblePersonId]
            : (
                await tx.taskGroupMember.findMany({
                  where: { groupId: task.responsibleGroupId ?? '' },
                  select: { personId: true },
                  take: 101,
                })
              ).map((member) => member.personId);
          if (recipients.length > 100)
            throw new Error('Task group exceeds configured recipient bound');
          await this.notifications.append(
            tx,
            recipients.map((recipientId) => ({
              recipientId,
              resourceType: 'LifecycleTask',
              resourceId: task.id,
              messageCode: 'TASK_DUE',
              dedupeKey: `task-due:${task.id}:${task.dueDate.toISOString()}:${recipientId}`,
            })),
          );
        });
      this.cursor = tasks.length === 100 ? tasks.at(-1)?.id : undefined;
    } catch {
      this.logger.warn('Task reminders will retry after a storage failure.');
    } finally {
      this.running = false;
    }
  }
}
