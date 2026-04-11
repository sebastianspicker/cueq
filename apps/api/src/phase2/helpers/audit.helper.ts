import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { Role } from '@cueq/database';
import { buildAuditEntry } from '@cueq/core';
import { PrismaService } from '../../persistence/prisma.service';

@Injectable()
export class AuditHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async appendAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
    reason?: string;
  }) {
    const draft = buildAuditEntry({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      reason: input.reason,
    });

    await this.prisma.auditEntry.create({
      data: {
        id: draft.id,
        timestamp: new Date(draft.timestamp),
        actorId: draft.actorId,
        action: draft.action,
        entityType: draft.entityType,
        entityId: draft.entityId,
        before: draft.before as Prisma.InputJsonValue,
        after: draft.after as Prisma.InputJsonValue,
        reason: draft.reason ?? undefined,
      },
    });
  }

  async resolveSystemActorId(): Promise<string | null> {
    const actor = await this.prisma.person.findFirst({
      where: { role: { in: [Role.ADMIN, Role.HR] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return actor?.id ?? null;
  }
}
