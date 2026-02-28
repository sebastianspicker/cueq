# Exec Plan: FR-300 Roster & Shift Planning

> **Status:** 🔄 In Progress | **Owner:** Roster Team | **Started:** 2026-02-28 | **Target:** 2026-03-07

---

## Goal

Deliver FR-300 as a complete vertical slice: multi-assignment roster planning, publish-time min-staffing enforcement, and booking-overlap plan-vs-actual metrics with API and web support.

## Context

Roster core helpers exist, but the product area is not yet specified/complete: no roster write API, no multi-assignment persistence model, and a placeholder roster UI. This plan closes that gap.

References:

- [docs/product-specs/roster-shift-planning.md](../../product-specs/roster-shift-planning.md)
- [docs/product-specs/index.md](../../product-specs/index.md)
- [docs/PLANS.md](../../PLANS.md)

## Scope

### In Scope

- New `ShiftAssignment` persistence model and schema contract
- Roster write lifecycle APIs for planners (draft editing + publish)
- Plan-vs-actual v2 metrics with detailed slot coverage output
- Roster web planner MVP with create/assign/publish/compare flow
- Test upgrades across core, integration, compliance, and acceptance

### Out of Scope

- Shift swap workflows
- Auto-scheduling/optimization
- Removal of legacy `Shift.personId`

## Task Sequence

- [x] Iteration 0: product spec + contract baseline
- [x] Iteration 1: schema-first + DB foundation
- [x] Iteration 2: core roster logic upgrades
- [x] Iteration 3: roster write APIs (draft editing)
- [x] Iteration 4: publish flow + min-staffing gate
- [x] Iteration 5: plan-vs-actual endpoint v2
- [x] Iteration 6: web roster MVP
- [x] Iteration 7: hardening, tests, docs closeout

## Definition of Done

- [x] FR-300 spec published and linked in product spec index
- [x] Roster write APIs available and contract-covered in OpenAPI
- [x] Planner-only write permissions enforced and compliance-tested
- [x] AT-03 assertions strengthened with deterministic metrics
- [x] Web roster acceptance flow covers create+assign+plan-vs-actual
- [ ] `make check` passes

## Linked PRs / Issues

| PR/Issue | Description | Status |
| -------- | ----------- | ------ |
| —        | —           | —      |

## Risks / Blockers

| Risk                                        | Mitigation                                                            | Status       |
| ------------------------------------------- | --------------------------------------------------------------------- | ------------ |
| Existing seed assumptions in closing checks | Keep additive data model and deterministic seed updates only          | ✅ Mitigated |
| OpenAPI drift during endpoint expansion     | Regenerate snapshot and enforce `make openapi-check`                  | ✅ Mitigated |
| UI/API auth friction in acceptance tests    | Keep token-injected roster UI flow aligned with existing test harness | ✅ Mitigated |
| Global core branch coverage gate <85%       | Keep FR-300 tests green; track separate coverage debt remediation     | ⏳ Pending   |

## Notes

Implementation follows one-concern-per-PR cadence even though this branch includes all iterations for review convenience.
