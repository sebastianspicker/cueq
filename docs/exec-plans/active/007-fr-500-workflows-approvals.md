# Exec Plan: FR-500 Workflows & Approvals

> **Status:** ✅ Complete | **Owner:** Workflow Domain Team | **Started:** 2026-02-28 | **Completed:** 2026-02-28

---

## Goal

Deliver FR-500 as a vertical slice with FSM v2, DB-configured delegation and policy, automated escalation, enriched workflow APIs, and approvals inbox MVP.

## Context

FR-500 is implemented end-to-end: FSM v2 is active in core + API contracts, policies/delegation are DB-backed and API-manageable, escalation automation is scheduled, and the approvals inbox supports actionable decisioning.

References:

- [docs/product-specs/workflows-approvals.md](../../product-specs/workflows-approvals.md)
- [docs/product-specs/index.md](../../product-specs/index.md)
- [docs/DESIGN.md](../../DESIGN.md)

## Scope

### In Scope

- core workflow FSM v2 (`DRAFT`, `SUBMITTED`, delegation-aware transitions)
- schema-first and DB foundation (`WorkflowPolicy`, `WorkflowDelegationRule`, enriched `WorkflowInstance`)
- workflow runtime extraction in API module
- policy/delegation CRUD APIs (HR/Admin)
- action-based decision command with legacy compatibility
- type-based RBAC with assignee checks
- hourly escalation worker with audit
- inbox/detail API enrichment
- web approvals inbox MVP and i18n updates
- tests + OpenAPI + docs synchronization

### Out of Scope

- full `SHIFT_SWAP` and `OVERTIME_APPROVAL` product flows
- admin UI for policy/delegation management
- non-hourly escalation scheduling strategies

## Task Sequence

- [x] Iteration 0: product spec + active plan baseline
- [x] Iteration 1: core FSM v2 + tests
- [x] Iteration 2: schema-first + Prisma foundation + backfill script
- [x] Iteration 3: workflow runtime extraction in API
- [x] Iteration 4: policy/delegation CRUD APIs + seed defaults
- [x] Iteration 5: decision API v2 + type-based RBAC
- [x] Iteration 6: hourly escalation worker + idempotency tests
- [x] Iteration 7: inbox/detail API enrichment
- [x] Iteration 8: approvals inbox web MVP
- [x] Iteration 9: hardening, contracts, docs closeout

## Definition of Done

- [x] FR-500 spec is published and linked from index
- [x] Workflow policies and delegation rules are DB-backed and API-manageable
- [x] Hourly escalation updates overdue workflows deterministically and is audit-logged
- [x] Action-based decision endpoint supports legacy payload compatibility
- [x] Type-based RBAC + assignee checks are compliance-tested
- [x] Approvals inbox web MVP supports approve/reject/delegate/cancel
- [x] OpenAPI snapshot is synchronized and contract-covered
- [x] `make check` passes

## Risks / Notes

- Existing `Phase2Service` is large; runtime extraction must remain incremental to avoid regressions.
- Scheduler behavior in tests must be deterministic (no flakiness from real-time cron execution).
- Status expansion affects multiple schemas/contracts and seed assumptions.
