import { randomUUID } from 'node:crypto';
import type { CoreAuditEntryDraftContract } from '@cueq/shared';
import type { AuditEntryDraft, DeepReadonly } from '../types';
import { deepFreeze, toIso } from '../utils';

export type BuildAuditEntryInput = CoreAuditEntryDraftContract['input'] & {
  id?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export function buildAuditEntry(input: BuildAuditEntryInput): DeepReadonly<AuditEntryDraft> {
  const entry: AuditEntryDraft = {
    id: input.id ?? randomUUID(),
    timestamp: input.timestamp ?? toIso(),
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    // Shallow-clone payloads so deepFreeze does not mutate the caller's objects.
    before: input.before ? { ...(input.before as Record<string, unknown>) } : undefined,
    after: input.after ? { ...(input.after as Record<string, unknown>) } : undefined,
    reason: input.reason ?? null,
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };

  return deepFreeze(entry) as DeepReadonly<AuditEntryDraft>;
}
