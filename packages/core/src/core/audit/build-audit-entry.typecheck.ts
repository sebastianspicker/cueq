import { buildAuditEntry } from './index';

const immutableEntry = buildAuditEntry({
  actorId: 'system',
  action: 'ENTITY_CHANGED',
  entityType: 'Entity',
  entityId: 'entity-1',
});

// @ts-expect-error Append-only object must be immutable
immutableEntry.action = 'MUTATE_ATTEMPT';
