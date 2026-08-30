/** Builds deeply immutable audit entries so downstream code cannot rewrite recorded facts. */
import { randomUUID } from 'node:crypto';
import { toIso } from '../calendar/instant.js';
import type { CoreAuditEntryDraftContract } from '../generated/schema-contracts.js';
import type { AuditEntryDraft, DeepReadonly } from '../types.js';
import { deepFreeze } from './immutability.js';

export type BuildAuditEntryInput = CoreAuditEntryDraftContract['input'] & {
  id?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

/** Create an identified, timestamped, deeply frozen audit draft without mutating caller payloads. */
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
