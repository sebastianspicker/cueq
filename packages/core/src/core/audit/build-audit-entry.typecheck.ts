import { buildAuditEntry } from './index';

const immutableEntry = buildAuditEntry({
  actorId: 'system',
  action: 'ENTITY_CHANGED',
  entityType: 'Entity',
  entityId: 'entity-1',
  before: { status: 'OLD' },
  after: { status: 'NEW' },
  reason: 'test',
});

// @ts-expect-error Append-only object must be immutable
immutableEntry.action = 'MUTATE_ATTEMPT';

// @ts-expect-error Cannot reassign id
immutableEntry.id = 'tampered-id';

// @ts-expect-error Cannot reassign timestamp
immutableEntry.timestamp = '2099-01-01T00:00:00.000Z';

// @ts-expect-error Cannot reassign actorId
immutableEntry.actorId = 'impostor';

// @ts-expect-error Cannot reassign entityId
immutableEntry.entityId = 'wrong-entity';

// @ts-expect-error Cannot reassign reason
immutableEntry.reason = 'tampered reason';
