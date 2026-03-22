# cueq — System Architecture

> This document provides the mental model for the cueq system. For detailed design decisions, see the [`docs/design-decisions/`](docs/design-decisions/) folder.

---

## 1. System Purpose

cueq is an integrated time-tracking, absence-management, and shift-planning system for a German university operating under **TV-L** (public-sector tariff) in **NRW**. It handles:

- **Time recording** via Honeywell terminals and web self-service
- **Shift & roster planning** for security desk (Pforte), IT on-call, facility services (Hausdienst), event technology (Veranstaltungstechnik)
- **Absence management** (leave, sick, special leave) with approval workflows
- **Monthly closing** with audit-grade exports to payroll
- **GDPR-compliant** operations with works-council co-determination support

---

## 2. Architecture Principles

1. **Domain-first.** Core business logic has zero I/O dependencies. All rules, calculations, and state machines live in `packages/core/src/core/` and are testable in isolation.
2. **Schema-driven contracts.** Every entity, API endpoint, event, and export format is defined in JSON Schema / OpenAPI _before_ implementation. Types are generated, not hand-written.
3. **Hexagonal / Ports & Adapters.** The core domain is surrounded by adapters (DB, terminals, SSO, exports) that can be swapped or mocked independently.
4. **Append-only audit.** The audit trail is structurally immutable. No code path may update or delete audit entries.
5. **Privacy by design.** Data minimization, role-based visibility, and configurable retention are architectural constraints, not afterthoughts.

---

## 3. High-Level Architecture (C4 — Context)

```
┌─────────────────────────────────────────────────────┐
│                    cueq System                       │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Time    │  │  Roster   │  │  Absence  │       │
│  │  Engine   │  │  Service  │  │  Service  │       │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘       │
│        │              │              │              │
│  ┌─────┴──────────────┴──────────────┴─────┐        │
│  │           Workflow / Approval            │        │
│  └─────────────────┬───────────────────────┘        │
│                    │                                │
│  ┌─────────────────┴───────────────────────┐        │
│  │        Closing & Export Engine           │        │
│  └─────────────────┬───────────────────────┘        │
│                    │                                │
│  ┌─────────────────┴───────────────────────┐        │
│  │           Audit Trail (append-only)     │        │
│  └─────────────────────────────────────────┘        │
└──────────┬──────────────┬──────────────┬────────────┘
           │              │              │
    ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴─────┐
    │  Honeywell  │ │  SSO/IdM  │ │  Payroll  │
    │  Terminals  │ │  (OIDC)   │ │  Export   │
    └─────────────┘ └───────────┘ └───────────┘
```

---

## 4. Core Services

| Service          | Responsibility                                                                                          | Source of Truth                       |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Time Engine      | Rule evaluation: pause enforcement, rest periods, max hours, surcharge calculation, plausibility checks | `packages/core/src/core/time-engine/` |
| Roster Service   | Shift planning, minimum staffing checks, qualification matching, plan-vs-actual comparison              | `packages/core/src/core/roster/`      |
| Absence Service  | Leave quota calculation, pro-rata targets, carry-over, forfeiture, team calendar visibility             | `packages/core/src/core/absence/`     |
| Workflow Service | Approval state machine, delegation chain resolution, escalation triggers, audit side-effects            | `packages/core/src/core/workflow/`    |
| Closing Engine   | Month-end checklist generation, cut-off lock transitions, export run lifecycle                          | `packages/core/src/core/closing/`     |
| Audit Service    | Append-only audit entry builder; enforces immutability at the type level                                | `packages/core/src/core/audit/`       |

---

## 5. Data Architecture (Conceptual)

Key entities (detailed model in [`docs/generated/db-schema.md`](docs/generated/db-schema.md)):

| Entity             | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `Person`           | Employee record (synced from HR/IdM)                           |
| `OrganizationUnit` | Department / team / cost center                                |
| `WorkTimeModel`    | Flextime / fixed / shift configuration per employee group      |
| `Shift`            | A scheduled time slot in a roster                              |
| `Roster`           | Published shift plan for an OE and period                      |
| `Booking`          | An actual time entry (terminal or self-service)                |
| `TimeType`         | Category of a booking (work, pause, on-call, deployment, etc.) |
| `TimeAccount`      | Running balance (daily/weekly/monthly)                         |
| `Absence`          | Leave / sick / special absence record                          |
| `WorkflowInstance` | Approval request with state + decision chain                   |
| `ExportRun`        | Record of a payroll export (timestamp, scope, hash)            |
| `AuditEntry`       | Immutable log entry (who, what, when, why)                     |

### Data Flow

```
Honeywell Terminal ──→ Terminal Gateway ──→ Booking ──→ Time Engine ──→ TimeAccount
Web Self-Service ──→ API ──→ Booking ──→ Time Engine ──→ TimeAccount
                                 ↓
                           Workflow (if correction/leave)
                                 ↓
                     Closing Engine ──→ Export ──→ Payroll
                                 ↓
                           Audit Trail
```

---

## 6. Integration Points

| System                     | Direction     | Protocol                         | Notes                                                  |
| -------------------------- | ------------- | -------------------------------- | ------------------------------------------------------ |
| **Honeywell Terminals**    | Inbound       | File import / `HONEYWELL_CSV_V1` | Offline buffering; batch sync with conflict resolution |
| **SSO / IdM**              | Bidirectional | SAML 2.0 / OIDC                  | Authentication + role mapping                          |
| **HR Master Data**         | Inbound       | File import / API                | Person, OE, work-time model, supervisor relationships  |
| **Payroll / Bezügestelle** | Outbound      | CSV / XML (schema-defined)       | Monthly export with protocol and idempotency           |
| **Calendar (optional)**    | Outbound      | ICS                              | Privacy-filtered ("absent" only, no reason)            |

Honeywell protocol baseline for the pilot is ratified as file-based `HONEYWELL_CSV_V1`.

---

## 7. Security Architecture

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model.

**Key constraints:**

- TLS everywhere (in transit)
- Encryption at rest for PII
- Role-based authorization on every endpoint and view
- No telemetry, no analytics, no phone-home
- Audit log is append-only and tamper-evident

---

## 8. Deployment Architecture

**Assumed baseline:**

- Docker-compose for local development
- PostgreSQL as the primary database
- Reverse proxy (nginx/traefik) for TLS termination
- CI/CD via GitHub Actions
- Runtime target: on-premises first, managed EU cloud compatible (see ADR-002)
- Monitoring baseline: Prometheus + Alertmanager + Grafana (see ADR-003)

---

## 9. References

- [`docs/DESIGN.md`](docs/DESIGN.md) — Design principles and patterns
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security design
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md) — Reliability and failover
- [`docs/design-decisions/`](docs/design-decisions/) — Architecture Decision Records
- [`docs/product-specs/index.md`](docs/product-specs/index.md) — Product specifications
- [`docs/PLANS.md`](docs/PLANS.md) — Execution phases and deliverables
