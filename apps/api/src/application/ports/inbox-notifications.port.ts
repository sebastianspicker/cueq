/** Feature-owned notifications are delivered inside the caller's transaction. */
import type { Prisma } from '@cueq/database';
export const INBOX_NOTIFICATIONS_PORT = Symbol('INBOX_NOTIFICATIONS_PORT');
export interface InboxNotificationInput {
  recipientId: string;
  resourceType: 'LifecycleTask' | 'PersonnelDocument';
  resourceId: string;
  messageCode: 'TASK_ASSIGNED' | 'TASK_DUE' | 'DOCUMENT_EXPIRING';
  dedupeKey: string;
}
export interface InboxNotificationsPort {
  append(tx: Prisma.TransactionClient, notifications: InboxNotificationInput[]): Promise<void>;
}
