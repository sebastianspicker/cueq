/** Recipient-only generic inbox with resource authorization rechecked before pagination. */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CursorQuerySchema } from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { AuditHelper } from '../audit/public.js';
import { documentScope } from '../documents/public.js';
import { lifecycleTaskScope } from './lifecycle-scope.js';

type InboxRow = {
  id: string;
  resourceType: string;
  resourceId: string;
  messageCode: string;
  readAt: Date | null;
  createdAt: Date;
};

function notificationScope(actorId: string) {
  return Prisma.sql`(
    (n."resourceType" = 'LifecycleTask' AND EXISTS (
      SELECT 1 FROM lifecycle_tasks t
      JOIN lifecycle_instances i ON i.id = t."instanceId"
      WHERE t.id = n."resourceId" AND ${lifecycleTaskScope(actorId, 'tasks.read')}
    ))
    OR (n."resourceType" = 'PersonnelDocument' AND EXISTS (
      SELECT 1 FROM personnel_documents d
      WHERE d.id = n."resourceId" AND ${documentScope(actorId, 'documents.read')}
    ))
  )`;
}

function inboxDto(row: InboxRow) {
  return {
    id: row.id,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    messageCode: row.messageCode,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class InboxService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async list(actorId: string, query: unknown) {
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.$queryRaw<InboxRow[]>(Prisma.sql`
      SELECT n.id, n."resourceType", n."resourceId", n."messageCode", n."readAt", n."createdAt"
      FROM inbox_notifications n
      WHERE n."recipientId" = ${actorId} AND ${notificationScope(actorId)}
        AND ${cursorSqlWhere('createdAt', Prisma.sql`n."createdAt"`, Prisma.sql`n.id`, input.cursor)}
      ORDER BY n."createdAt" ASC, n.id ASC
      LIMIT ${input.limit + 1}
    `);
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, inboxDto);
  }

  async markRead(actorId: string, notificationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM inbox_notifications WHERE id = ${notificationId} FOR UPDATE
      `);
      const [notification] = await tx.$queryRaw<InboxRow[]>(Prisma.sql`
        SELECT n.id, n."resourceType", n."resourceId", n."messageCode", n."readAt", n."createdAt"
        FROM inbox_notifications n
        WHERE n.id = ${notificationId} AND n."recipientId" = ${actorId}
          AND ${notificationScope(actorId)}
        LIMIT 1
      `);
      if (!notification) throw new NotFoundException('Inbox notification not found.');
      if (notification.readAt) return inboxDto(notification);
      const readAt = new Date();
      const updated = await tx.inboxNotification.update({
        where: { id: notificationId },
        data: { readAt },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'INBOX_NOTIFICATION_READ',
          entityType: 'InboxNotification',
          entityId: notificationId,
          after: { readAt: readAt.toISOString(), resourceType: notification.resourceType },
        },
        tx,
      );
      return inboxDto(updated);
    });
  }
}
