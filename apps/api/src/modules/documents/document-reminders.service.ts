/** Configurable expiry reminders create only generic, authorization-filtered in-app notifications. */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../persistence/prisma.service.js';
import {
  INBOX_NOTIFICATIONS_PORT,
  type InboxNotificationsPort,
} from '../../application/ports/inbox-notifications.port.js';

@Injectable()
export class DocumentRemindersService implements OnModuleInit {
  private running = false;
  private readonly logger = new Logger(DocumentRemindersService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(INBOX_NOTIFICATIONS_PORT) private readonly notifications: InboxNotificationsPort,
  ) {}
  onModuleInit() {
    void this.poll();
  }

  @Interval(30_000)
  async poll() {
    if (this.running || !process.env.DOCUMENT_STORAGE_ROOT) return;
    const days = Number(process.env.DOCUMENT_REMINDER_DAYS ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      this.logger.warn('DOCUMENT_REMINDER_DAYS must be an integer from 1 to 365.');
      return;
    }
    this.running = true;
    try {
      let cursor: string | undefined;
      const through = new Date(Date.now() + days * 86_400_000);
      for (;;) {
        const rows = await this.prisma.personnelDocument.findMany({
          where: { expiresAt: { lte: through }, ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: 'asc' },
          take: 100,
          select: { id: true },
        });
        for (const row of rows)
          await this.prisma.$transaction(async (tx) => {
            const document = await tx.personnelDocument.findUnique({ where: { id: row.id } });
            if (!document?.expiresAt || document.expiresAt > through) return;
            const version = await tx.personnelDocumentVersion.findFirst({
              where: { documentId: document.id },
              select: { id: true },
            });
            if (!version) return;
            await this.notifications.append(tx, [
              {
                recipientId: document.personId,
                resourceType: 'PersonnelDocument',
                resourceId: document.id,
                messageCode: 'DOCUMENT_EXPIRING',
                dedupeKey: `document-expiry:${document.id}:${document.expiresAt.toISOString()}`,
              },
            ]);
          });
        if (rows.length < 100) break;
        cursor = rows.at(-1)?.id;
      }
    } catch {
      this.logger.warn('Document expiry reminders will retry after a database failure.');
    } finally {
      this.running = false;
    }
  }
}
