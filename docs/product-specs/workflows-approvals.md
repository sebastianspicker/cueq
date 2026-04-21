# Product Spec: Workflows & Approvals (FR-500)

> **Status:** ✅ Implemented | **Scope:** Core + API + Web

---

## 1. Summary

FR-500 delivers a configurable workflow engine for approval-heavy operations with:

- finite-state workflow transitions (`DRAFT -> SUBMITTED -> PENDING -> ESCALATED -> APPROVED/REJECTED`, plus `CANCELLED`)
- DB-backed delegation rules with effective windows and cycle-safe traversal
- DB-backed workflow policy (deadline + escalation chain + max delegation depth)
- type-based authorization matrix (no broad approver shortcut)
- hourly automated escalation with immutable audit entries
- approval inbox/detail APIs and web MVP for approve/reject/delegate/cancel actions

Implemented workflow types:

- `LEAVE_REQUEST`
- `BOOKING_CORRECTION`
- `POST_CLOSE_CORRECTION`
- `SHIFT_SWAP`
- `OVERTIME_APPROVAL`

## 2. Contracts and Entry Points

### Core (`@cueq/core`)

- `transitionWorkflow(...)` FSM v2
- `resolveDelegation(...)` with cycle guard + max depth
- `shouldEscalate(...)`

### Shared Schemas (`@cueq/shared`)

- workflow status includes `DRAFT`, `SUBMITTED`
- decision command supports actions:
  - `APPROVE`
  - `REJECT`
  - `DELEGATE`
  - `CANCEL`
- legacy decision compatibility accepted:
  - `decision: APPROVED|REJECTED`

### API (`apps/api`)

- `GET /v1/workflows/inbox` (+ `status`, `type`, `overdueOnly`)
- `GET /v1/workflows/{id}`
- `POST /v1/workflows/{id}/decision`
- `POST /v1/workflows/shift-swaps`
- `POST /v1/workflows/overtime-approvals`
- `GET /v1/workflows/policies` (HR/Admin)
- `PUT /v1/workflows/policies/{type}` (HR/Admin)
- `GET /v1/workflows/delegations` (HR/Admin)
- `POST /v1/workflows/delegations` (HR/Admin)
- `PATCH /v1/workflows/delegations/{id}` (HR/Admin)
- `DELETE /v1/workflows/delegations/{id}` (HR/Admin)

### Web (`apps/web`)

- `/[locale]/approvals` inbox MVP
  - filter/list
  - detail
  - approve/reject/delegate/cancel
  - overdue and escalation indicators

## 3. Policy Defaults

- `LEAVE_REQUEST`: deadline `48h`, escalation chain `HR -> ADMIN`
- `BOOKING_CORRECTION`: deadline `48h`, escalation chain `HR -> ADMIN`
- `POST_CLOSE_CORRECTION`: deadline `24h`, escalation chain `HR -> ADMIN`
- delegation max depth: `5`
- active window semantics: inclusive bounds (`activeFrom <= now <= activeTo`)

## 4. Authorization Matrix

- `LEAVE_REQUEST`: `TEAM_LEAD` primary (OU-scoped), `HR`/`ADMIN` fallback
- `BOOKING_CORRECTION`: `TEAM_LEAD` primary (OU-scoped), `HR`/`ADMIN` fallback
- `POST_CLOSE_CORRECTION`: `HR`/`ADMIN` only

Decision actions additionally require current assignee authority.

## 5. Escalation Semantics

- escalation is triggered by hourly scheduler
- candidate set: overdue `PENDING` workflows (`dueAt <= now`)
- transition: `PENDING -> ESCALATED`
- assignment updates to next escalation actor from policy/delegation
- idempotent behavior: already escalated instances are skipped
- every escalation append-writes a workflow audit entry

## 6. Acceptance Coverage Targets

| Case                                                   | Coverage Target                              |
| ------------------------------------------------------ | -------------------------------------------- |
| FSM v2 transition matrix                               | core workflow unit tests                     |
| Delegation cycle/depth protection                      | core workflow unit tests                     |
| Policy CRUD + Delegation CRUD                          | API integration tests                        |
| Action command + legacy decision compatibility         | API integration tests                        |
| Hourly escalation idempotency and assignee progression | API integration tests                        |
| Type-based RBAC + assignee checks                      | compliance tests                             |
| AT-02 delegation + escalation flow                     | acceptance tests                             |
| approvals web action flow                              | Playwright acceptance tests                  |
| OpenAPI path/schema drift                              | openapi contract test + `make openapi-check` |

## 7. Out of Scope

- workflow admin UI for policies/delegations
- cross-tenant/custom policy versioning beyond current DB model
