# Design principles

This document describes cueq's domain and implementation patterns. See
[`ARCHITECTURE.md`](../ARCHITECTURE.md) for runtime structure and
[`design-docs/core-beliefs.md`](design-docs/core-beliefs.md) for the domain
glossary and engineering constraints.

## Product and domain design

### Brand identity

cueq uses a lowercase wordmark, a mirrored c/q mark, and the German-first
descriptor “Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen.”
Product chrome uses a mineral campus canvas, archive-ink text, one Rhine teal
accent, structural borders, and a restrained active queue rail. Compact
humanist interface type keeps page commands and dense records in one coherent
operational hierarchy. See the [`BRAND.md`](BRAND.md) usage rules.

### Domain model

cueq uses a small set of domain-driven design patterns:

- Ubiquitous language: German domain terms have canonical English mappings (see [glossary](design-docs/core-beliefs.md#domain-glossary)). Use the English terms in code; German terms in user-facing text.
- Bounded contexts: Time Engine, Roster, Absence, Workflow, Closing, and Audit are distinct contexts with clear boundaries.
- Entities & Value Objects: Entities have identity (`Booking`, `Person`); value objects do not (`TimeRange`, `Balance`).
- Domain events: Selected application writes append outbox events for
  integration delivery. Event and audit coverage is verified per write path; it
  is not claimed for every state change.

### Dependency direction

- `packages/domain/src/` is the pure domain boundary and does not import
  NestJS, Prisma, HTTP, or filesystem APIs.
- `apps/api/` coordinates transport, authorization, transactions, persistence,
  audit, and integration side effects.
- `apps/web/` consumes public contracts through feature-owned routes and the
  browser client in `apps/web/src/platform/http/`.
- Domain rules remain testable with plain unit tests; application services
  use focused test doubles at their I/O boundaries.

### Schema-first development

1. Define the entity/contract in JSON Schema (`schemas/`)
2. Generate TypeScript types (`make generate`)
3. Implement logic using generated types
4. Write focused tests with minimal inline or programmatic cases

Generated contracts must not be hand-edited. When a schema is the source of
truth, update it first and regenerate the derived artifacts.

## Runtime patterns

### Rule engine

The time engine evaluates rules (pause enforcement, rest periods, max hours) using a configurable rule set:

```
RuleSet → [Rule] → evaluate(bookings, model) → [Violation | Warning]
```

- Rules are data: stored as configuration, not hard-coded.
- Rules have effective dates: a rule change on March 1st doesn't retroactively affect February.
- Rule evaluation is pure: given the same inputs, it produces the same outputs.

### Workflow state machine

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

### Append-only audit

The audit trail is an append-only log:

- No `UPDATE` or `DELETE` operations on the audit table.
- Each entry has: `id`, `timestamp`, `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `reason`.
- The alpha candidate includes a PostgreSQL trigger that rejects row updates and deletes when its
  migration is applied. This is mutation resistance, not cryptographic tamper
  evidence.

### Persistence boundary

Prisma access lives in `apps/api/src/persistence/` and application helpers and
services. Core rules receive plain data and return decisions; they do not own a
repository abstraction that does not exist in the current source tree.

## Error handling

- Core decisions use structured violations and warnings where those domain
  contracts define them.
- API validation/database errors are normalized by the Zod and Prisma
  exception filters; Nest HTTP exceptions retain their handler-specific shape.
- Not yet universal: localized error envelopes, stable application error
  codes, and correlation IDs are not enforced across every endpoint.
- Sensitive failures must not expose credentials, secrets, raw database
  exceptions, or upstream network details.

## Test boundaries

| Layer                         | Current check                                |
| ----------------------------- | -------------------------------------------- |
| Domain, contracts, and policy | Focused unit and contract tests              |
| API platform and modules      | Focused service, adapter, and boundary tests |
| Web platform                  | Focused HTTP and security-policy tests       |
| Database                      | One PostgreSQL storage-invariant suite       |
| Browser                       | No committed automated browser suite         |

See [`QUALITY_GATES.md`](QUALITY_GATES.md) for enforced commands and explicitly
non-enforced targets.

## References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md): System-level architecture
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md): Core beliefs and glossary
- [`SECURITY.md`](SECURITY.md): Security patterns
- [`FRONTEND.md`](FRONTEND.md): Frontend design conventions
- [`BRAND.md`](BRAND.md): Product identity and usage rules
- [`QUALITY_GATES.md`](QUALITY_GATES.md): Quality targets
