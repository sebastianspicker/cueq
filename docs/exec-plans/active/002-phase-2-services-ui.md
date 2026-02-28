# Exec Plan: Phase 2 Services + UI

> **Status:** 🟡 Active | **Owner:** Services + UI Team | **Started:** 2026-02-28 | **Target:** 2026-05-31

---

## Goal

Deliver Phase 2 by implementing API services, adapters, and user-facing UI with deterministic acceptance coverage, reaching 7/8 MVP acceptance tests green.

## Context

Phase 1 delivered pure domain logic in `@cueq/core`. Phase 2 must connect this logic to persistence, authentication, API contracts, and frontend flows.

References:

- [docs/PLANS.md](../../PLANS.md)
- [docs/QUALITY_SCORE.md](../../QUALITY_SCORE.md)
- [docs/product-specs/phase-2-acceptance-scenarios.md](../../product-specs/phase-2-acceptance-scenarios.md)

## Scope

### In Scope

- OIDC-first auth adapter with Keycloak dev/mock support
- PostgreSQL-backed persistence adapters for Phase 2 API slices
- `/v1` API endpoints for dashboard, bookings, absences, calendar, workflows, roster, on-call, closing/export, and terminal sync
- Next.js UI for dashboard, team calendar, roster, and approval inbox
- DE/EN translations via `next-intl` (default `de`)
- Playwright acceptance tests + API contract tests
- Deterministic seed/reset workflow for acceptance data

### Out of Scope

- Backup/restore acceptance test AT-08 (Phase 3)
- Honeywell protocol hard integration beyond CSV adapter v0
- Final payroll wire-format harmonization beyond deterministic export v0

## Task Sequence

- [ ] Iteration 0: Plan/docs alignment + acceptance matrix sync
- [ ] Iteration 1: test harness foundation (integration/acceptance/compliance executable)
- [ ] Iteration 2: auth + RBAC + OIDC mock
- [ ] Iteration 3: persistence adapters + audit append-only guardrails
- [ ] Iteration 4: dashboard + bookings vertical slice
- [ ] Iteration 5: absence + team calendar + privacy
- [ ] Iteration 6: workflows corrections + delegation + inbox
- [ ] Iteration 7: roster + plan-vs-actual
- [ ] Iteration 8: on-call deployments + compliance
- [ ] Iteration 9: closing + export + HR correction
- [ ] Iteration 10: terminal offline→sync
- [ ] Iteration 11: contract/a11y/i18n hardening + closeout

## Definition of Done

- [ ] OpenAPI implementation coverage complete for all `/v1` endpoints
- [ ] AT-01..AT-07 pass in `make test-acceptance`
- [ ] UI critical axe violations = 0 in acceptance checks
- [ ] `make test-all` passes
- [ ] `make openapi-check` passes
- [ ] Phase status updated in [docs/PLANS.md](../../PLANS.md)

## Linked PRs / Issues

| PR/Issue | Description | Status |
| -------- | ----------- | ------ |
| —        | —           | —      |

## Risks / Blockers

| Risk                             | Mitigation                                            | Status    |
| -------------------------------- | ----------------------------------------------------- | --------- |
| Honeywell protocol not finalized | Encapsulate sync in CSV adapter v0 + port abstraction | 🟡 Active |
| Payroll format not finalized     | Deterministic export v0 with checksum and audit trail | 🟡 Active |
| Scope creep across domains       | Enforce strict Phase 2 DoD in slices                  | 🟡 Active |

## Notes

The acceptance target for Phase 2 is intentionally 7/8 (AT-01..AT-07). AT-08 backup/restore remains Phase 3.
