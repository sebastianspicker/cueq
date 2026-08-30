/** Narrow write-only audit boundary for platform collaborators. */
import type { Prisma } from '@cueq/database';

export const AUDIT_WRITER_PORT = Symbol('AUDIT_WRITER_PORT');

export interface AuditWriterPort {
  appendAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
    reason?: string;
  }): Promise<void>;
}
