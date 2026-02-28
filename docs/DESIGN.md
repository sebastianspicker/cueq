# DESIGN.md — Design Principles & Patterns

> This document describes the design philosophy and implementation patterns for cueq. For the system architecture, see [`ARCHITECTURE.md`](../ARCHITECTURE.md). For core beliefs and glossary, see [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md).

---

## 1. Design Philosophy

### Domain-Driven Design (Lite)

cueq uses DDD-inspired patterns without the full ceremonial weight:

- **Ubiquitous language**: German domain terms have canonical English mappings (see [glossary](design-docs/core-beliefs.md#domain-glossary)). Use the English terms in code; German terms in user-facing text.
- **Bounded contexts**: Time Engine, Roster, Absence, Workflow, Closing, and Audit are distinct contexts with clear boundaries.
- **Entities & Value Objects**: Entities have identity (`Booking`, `Person`); value objects do not (`TimeRange`, `Balance`).
- **Domain events**: State changes emit events (e.g., `BookingCreated`, `LeaveApproved`) that feed the audit trail and enable future event-driven integrations.

### Hexagonal Architecture

```
         ┌─────────────────┐
         │   Adapters (I/O) │
         │  DB, HTTP, SSO,  │
         │  Terminals, Files │
         └────────┬─────────┘
                  │
         ┌────────┴─────────┐
         │   Core Domain     │
         │  (pure logic,     │
         │   no I/O deps)    │
         └────────┬─────────┘
                  │
         ┌────────┴─────────┐
         │   Adapters (I/O) │
         │  Export, Calendar, │
         │  Notifications    │
         └──────────────────┘
```

- `packages/core/src/core/` contains **zero imports from frameworks, databases, or HTTP libraries**.
- All I/O happens through **port interfaces** defined in core, implemented by adapters.
- This guarantees core logic is testable with plain unit tests — no mocking frameworks needed.

### Schema-First Development

1. Define the entity/contract in JSON Schema (`schemas/`)
2. Generate TypeScript types (`make generate`)
3. Implement logic using generated types
4. Write tests against reference fixtures

This order is mandatory. Code must never define types that contradict schemas.

---

## 2. Key Patterns

### Rule Engine Pattern

The time engine evaluates rules (pause enforcement, rest periods, max hours) using a **configurable rule set**:

```
RuleSet → [Rule] → evaluate(bookings, model) → [Violation | Warning]
```

- Rules are data: stored as configuration, not hard-coded.
- Rules have effective dates: a rule change on March 1st doesn't retroactively affect February.
- Rule evaluation is pure: given the same inputs, it produces the same outputs.

### Workflow State Machine

Approval workflows follow a **finite state machine**:

```
Draft → Submitted → Pending → Approved | Rejected
                      ↓
                   Escalated → Approved | Rejected
```

- Each transition records an audit entry.
- Delegation inserts a new approver into the chain without changing the state machine.
- Escalation is time-triggered (configurable deadline per workflow type).

### Append-Only Audit

The audit trail is an **append-only log**:

- No `UPDATE` or `DELETE` operations on the audit table.
- Each entry has: `id`, `timestamp`, `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `reason`.
- The persistence adapter enforces immutability at the database level (e.g., no update/delete permissions on the audit table).

### Repository Pattern (Adapters)

Each domain entity has a **repository interface** defined in `packages/core/src/core/`:

```typescript
interface BookingRepository {
  findById(id: BookingId): Promise<Booking | null>;
  findByPersonAndDateRange(personId: PersonId, range: DateRange): Promise<Booking[]>;
  save(booking: Booking): Promise<void>;
}
```

The implementation in `src/adapters/persistence/` handles SQL, connection pooling, and transaction management. The core never knows about the database.

---

## 3. Error Handling Strategy

- **Domain errors** are typed (e.g., `RuleViolation`, `InsufficientLeaveBalance`) — not generic exceptions.
- **Adapter errors** (DB timeout, SSO failure) are wrapped in typed error envelopes.
- **API errors** follow a consistent JSON format with error codes, human-readable messages (DE/EN), and correlation IDs.
- **No silent failures.** Every error is logged and, where relevant, recorded in the audit trail.

---

## 4. Testing Strategy

| Layer                     | Type        | Speed | What it validates                             |
| ------------------------- | ----------- | ----- | --------------------------------------------- |
| `packages/core/src/core/` | Unit        | <10s  | Business logic, rule evaluation, calculations |
| `src/adapters/`           | Integration | <60s  | DB queries, SSO handshake, terminal import    |
| `src/api/`                | Contract    | <30s  | API matches OpenAPI spec                      |
| End-to-end                | Acceptance  | <5min | 8 MVP scenarios from PRD                      |
| Cross-cutting             | Compliance  | <30s  | GDPR visibility, audit immutability           |

See [`QUALITY_SCORE.md`](QUALITY_SCORE.md) for coverage targets and metrics.

---

## 5. References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — System-level architecture
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md) — Core beliefs and glossary
- [`SECURITY.md`](SECURITY.md) — Security patterns
- [`FRONTEND.md`](FRONTEND.md) — Frontend design conventions
- [`QUALITY_SCORE.md`](QUALITY_SCORE.md) — Quality targets
