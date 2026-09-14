/** Global transactional implementation of the feature-neutral inbox notification port. */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type {
  InboxNotificationInput,
  InboxNotificationsPort,
} from '../../application/ports/inbox-notifications.port.js';

const NOTIFICATION_WRITE_BATCH = 500;

@Injectable()
export class InboxNotificationsService implements InboxNotificationsPort {
  async append(tx: Prisma.TransactionClient, notifications: InboxNotificationInput[]) {
    for (let index = 0; index < notifications.length; index += NOTIFICATION_WRITE_BATCH) {
      await tx.inboxNotification.createMany({
        data: notifications.slice(index, index + NOTIFICATION_WRITE_BATCH),
        skipDuplicates: true,
      });
    }
  }
}
