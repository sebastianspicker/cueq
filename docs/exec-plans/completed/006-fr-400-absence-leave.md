# Exec Plan: FR-400 Absence & Leave

> **Status:** ✅ Implemented | **Owner:** Absence Domain Team | **Started:** 2026-02-28 | **Completed:** 2026-02-28

---

## Goal

Deliver FR-400 as a complete vertical slice: leave quotas, carry-over/forfeiture behavior, leave-request workflows, and role-aware team-calendar visibility.

## Context

Core and API scaffolding existed, but leave balance and calendar behavior were partial:

- fixed `employmentFraction = 1`
- no adjustment ledger
- no leave-request workflow coupling
- static calendar defaults

This execution plan closes those gaps with deterministic policy behavior and test coverage.

## Scope

### In Scope

- Prisma schema updates for employment window metadata and leave adjustments
- Core leave ledger and working-day counting
- API routing for leave requests, cancellation, leave adjustments, and balance v2
- Workflow decision coupling for `LEAVE_REQUEST`
- Team calendar role-aware status scope and redaction
- Web leave page + interactive team calendar
- OpenAPI and acceptance/compliance test updates
- FR-400 product spec publication

### Out of Scope

- eAU integration
- custom weekday calendars per employee
- leave planning automation

## Task Sequence

- [x] Iteration 0: product spec + traceability baseline
- [x] Iteration 1: schema/data foundation
- [x] Iteration 2: core leave ledger + day counting
- [x] Iteration 3: absence workflow coupling + cancellation
- [x] Iteration 4: leave balance v2
- [x] Iteration 5: team calendar v2 semantics
- [x] Iteration 6: web leave + calendar vertical slice
- [x] Iteration 7: OpenAPI/contracts/tests hardening
- [x] Iteration 8: docs closeout

## Definition of Done

- [x] FR-400 spec published and indexed
- [x] Carry-over, forfeiture, and adjustments are API-visible and tested
- [x] Leave request workflow transitions update linked absences
- [x] Team-calendar visibility split is role-tested
- [x] New FR-400 endpoints included in OpenAPI path coverage
- [x] Full `make check` run on final branch snapshot

## Risks / Notes

- Historical carry-over is currently computed from immediate previous year in service logic.
- Holiday exclusions rely on curated fixture files by year.
