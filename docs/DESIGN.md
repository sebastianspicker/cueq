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

- `packages/core/src/core/` is the pure domain boundary and does not import
  NestJS, Prisma, HTTP, or filesystem APIs.
- `apps/api/` coordinates transport, authorization, transactions, persistence,
  audit, and integration side effects.
- `apps/web/` consumes public contracts through the shared API client.
- Pure core rules remain testable with plain unit tests; application services
  use focused test doubles at their I/O boundaries.

### Schema-First Development

1. Define the entity/contract in JSON Schema (`schemas/`)
2. Generate TypeScript types (`make generate`)
3. Implement logic using generated types
4. Write tests against reference fixtures

Generated contracts must not be hand-edited. When a schema is the source of
truth, update it first and regenerate the derived artifacts.

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

### Persistence Boundary

Prisma access lives in `apps/api/src/persistence/` and application helpers and
services. Core rules receive plain data and return decisions; they do not own a
repository abstraction that does not exist in the current source tree.

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
| `apps/api/src/`           | Integration | <60s  | DB queries, auth adapters, terminal import    |
| `apps/api/test/`          | Contract    | <30s  | API matches OpenAPI spec                      |
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
