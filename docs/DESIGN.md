# DESIGN.md: Design Principles and Patterns

> This document describes the design philosophy and implementation patterns for cueq. For the system architecture, see [`ARCHITECTURE.md`](../ARCHITECTURE.md). For core beliefs and glossary, see [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md).

---

## 1. Design Philosophy

### Brand identity

cueq uses a lowercase wordmark, a mirrored c/q mark, and the German-first
descriptor “Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen.”
Product chrome uses a mineral campus canvas, archive-ink text, one Rhine teal
accent, structural borders, and a restrained active queue rail. Compact
humanist interface type keeps page commands and dense records in one coherent
operational hierarchy. See the [`BRAND.md`](BRAND.md) usage rules.

### Domain-Driven Design (Lite)

cueq uses DDD-inspired patterns without the full ceremonial weight:

- Ubiquitous language: German domain terms have canonical English mappings (see [glossary](design-docs/core-beliefs.md#domain-glossary)). Use the English terms in code; German terms in user-facing text.
- Bounded contexts: Time Engine, Roster, Absence, Workflow, Closing, and Audit are distinct contexts with clear boundaries.
- Entities & Value Objects: Entities have identity (`Booking`, `Person`); value objects do not (`TimeRange`, `Balance`).
- Domain events: Selected application writes append outbox events for
  integration delivery. Event and audit coverage is verified per write path; it
  is not claimed for every state change.

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

The time engine evaluates rules (pause enforcement, rest periods, max hours) using a configurable rule set:

```
RuleSet → [Rule] → evaluate(bookings, model) → [Violation | Warning]
```

- Rules are data: stored as configuration, not hard-coded.
- Rules have effective dates: a rule change on March 1st doesn't retroactively affect February.
- Rule evaluation is pure: given the same inputs, it produces the same outputs.

### Workflow State Machine

Approval workflows follow a finite state machine:

```
Draft → Submitted → Pending → Approved | Rejected
                      ↓
                   Escalated → Approved | Rejected
```

- Implemented workflow transitions are expected to append an audit entry; the
  focused service tests cover selected transition paths.
- Delegation inserts a new approver into the chain without changing the state machine.
- Escalation is time-triggered (configurable deadline per workflow type).

### Append-Only Audit

The audit trail is an append-only log:

- No `UPDATE` or `DELETE` operations on the audit table.
- Each entry has: `id`, `timestamp`, `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `reason`.
- The alpha candidate includes a PostgreSQL trigger that rejects row updates and deletes when its
  migration is applied. This is mutation resistance, not cryptographic tamper
  evidence.

### Persistence Boundary

Prisma access lives in `apps/api/src/persistence/` and application helpers and
services. Core rules receive plain data and return decisions; they do not own a
repository abstraction that does not exist in the current source tree.

---

## 3. Error Handling Strategy

- Core decisions use structured violations and warnings where those domain
  contracts define them.
- API validation/database errors are normalized by the Zod and Prisma
  exception filters; Nest HTTP exceptions retain their handler-specific shape.
- Not yet universal: localized error envelopes, stable application error
  codes, and correlation IDs are not enforced across every endpoint.
- Sensitive failures must not expose credentials, secrets, raw database
  exceptions, or upstream network details.

---

## 4. Testing Strategy

| Layer                     | Type        | What it validates                                      |
| ------------------------- | ----------- | ------------------------------------------------------ |
| `packages/core/src/core/` | Unit        | Business logic, rule evaluation, calculations          |
| `apps/api/src/`           | Focused/API | Services, controllers, adapters, and error boundaries  |
| `apps/api/test/`          | Integration | PostgreSQL behavior and generated OpenAPI contracts    |
| End-to-end                | Acceptance  | Browser workflows against the local API and PostgreSQL |
| Cross-cutting             | Compliance  | Selected privacy, role, and audit invariants           |

See [`QUALITY_GATES.md`](QUALITY_GATES.md) for enforced commands and explicitly
non-enforced targets.

---

## 5. References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md): System-level architecture
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md): Core beliefs and glossary
- [`SECURITY.md`](SECURITY.md): Security patterns
- [`FRONTEND.md`](FRONTEND.md): Frontend design conventions
- [`BRAND.md`](BRAND.md): Product identity and usage rules
- [`QUALITY_GATES.md`](QUALITY_GATES.md): Quality targets
