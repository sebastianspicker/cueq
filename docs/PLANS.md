# PLANS.md — Current Execution Plans & Phases

> This document summarizes where cueq is in its development lifecycle. For active execution plans, see [`exec-plans/active/`](exec-plans/active/).

---

## Current Phase: Phase 1 — Domain Core

**Goal**: Implement pure domain logic (time engine, absence, workflow, roster, closing, audit) with deterministic fixture coverage and >90% core unit coverage.

**Status**: 🟡 In Progress (Phase 1 implemented on branch; pending merge/default-branch confirmation)

---

## Phase Overview

| Phase       | Name               | Goal                                                                                     | Status                                 |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| **Phase 0** | Harness Foundation | CI, schemas, config, scripts, docs skeleton                                              | ✅ Complete                            |
| **Phase 1** | Domain Core        | Pure logic (time engine, absence, workflow, roster, closing, audit) with full unit tests | 🟡 In Progress (implemented on branch) |
| **Phase 2** | Services + UI      | API, adapters, frontend; 7/8 acceptance tests green                                      | ⏳ Planned                             |
| **Phase 3** | Integrations + Ops | Terminal gateway, HR import, payroll export, backup/restore; pilot-ready                 | ⏳ Planned                             |

---

## Phase 0 — Harness Foundation (Current)

### Deliverables

| #    | Deliverable                                                                              | Status      |
| ---- | ---------------------------------------------------------------------------------------- | ----------- |
| 0.1  | Root config files (`tsconfig.json`, linter, formatter, `Makefile`, `docker-compose.yml`) | ✅ Complete |
| 0.2  | CI pipeline (`.github/workflows/ci.yml`)                                                 | ✅ Complete |
| 0.3  | JSON Schema stubs for all domain entities                                                | ✅ Complete |
| 0.4  | OpenAPI stub with health endpoint                                                        | ✅ Complete |
| 0.5  | Fixture stubs (reference calculations)                                                   | ✅ Complete |
| 0.6  | Test scaffolding (runner config, placeholder tests)                                      | ✅ Complete |
| 0.7  | Script stubs (`scripts/*.sh`)                                                            | ✅ Complete |
| 0.8  | Documentation foundation (this PR: AGENTS.md, ARCHITECTURE.md, docs/)                    | ✅ Complete |
| 0.9  | Issue/PR templates                                                                       | ✅ Complete |
| 0.10 | ADR-001: Tech stack decision                                                             | ✅ Complete |

### Definition of Done (Phase 0)

- [ ] `make check` passes on a fresh clone (validated by CI smoke job after merge)
- [ ] CI runs green on the default branch (pending merge)
- [x] All schemas pass validation
- [x] ADR-001 is written and merged
- [ ] A new contributor can run `make setup && make check` successfully (validated by CI smoke job after merge)

---

## Phase 1 — Domain Core

### Deliverables

- [x] `packages/core/src/core/time-engine/`: plausibility checks, balance calculation, rule-violation mapping
- [x] `packages/core/src/core/absence/`: pro-rata targets and leave quota/carry-over/forfeiture helpers
- [x] `packages/core/src/core/workflow/`: approval state machine, escalation trigger, delegation chain resolution
- [x] `packages/core/src/core/roster/`: shift compliance, min-staffing, plan-vs-actual
- [x] `packages/core/src/core/closing/`: checklist generation and cut-off lock transitions
- [x] `packages/core/src/core/audit/`: immutable audit entry builder (append-only API surface)
- [x] Core domain schemas under `schemas/domain/core-*.schema.json`
- [x] Type generation wired into `make generate` (`scripts/generate-core-schema-types.mjs`)
- [x] Dual fixture tracks: synthetic (`fixtures/reference-calculations/`) + anonymized-derived (`fixtures/reference-calculations-real/`)
- [x] NRW holiday dataset (`fixtures/calendars/nrw-holidays-2026.json`) for deterministic rule tests
- [x] Coverage gate configured for `packages/core/src/core/**` (>=90% lines/statements/functions)

### Definition of Done (Phase 1)

- [x] 4 reference calculations pass (flextime, shift/Pforte, part-time change, on-call/IT)
- [x] Rule violations correctly detected per PRD
- [x] Audit entries immutable by type-system design
- [x] Domain glossary complete in `docs/design-docs/core-beliefs.md`

---

## Phase 2 — Services + UI

### Deliverables (Preview)

- PostgreSQL persistence adapters
- SSO adapter (SAML/OIDC) with mock in docker-compose
- REST API matching OpenAPI spec
- Employee dashboard, team calendar, roster view, approval inbox
- DE + EN translations
- 7/8 acceptance tests passing

### Definition of Done (Phase 2)

- [ ] OpenAPI spec and implementation match (contract-tested)
- [ ] 7 of 8 MVP acceptance tests pass
- [ ] UI passes axe-core a11y checks (no critical violations)
- [ ] `make test-all` passes

---

## Phase 3 — Integrations + Operations

### Deliverables (Preview)

- Honeywell terminal gateway (import, offline buffer, sync)
- HR master data import (file + optional API)
- Payroll export (schema-compliant, reproducible)
- Backup/restore automated verification
- Pilot seed data (admin dept, Pforte, IT on-call)
- Completed runbook, monitoring, and compliance docs

### Definition of Done (Phase 3)

- [ ] All 8 acceptance tests pass
- [ ] Terminal offline→sync works with simulated data
- [ ] Export reproducibility verified
- [ ] Backup/restore tested in CI
- [ ] Pilot readiness checklist fully green

---

## Execution Plans

Active and completed execution plans are tracked in:

- **Active**: [`exec-plans/active/`](exec-plans/active/) — use the [template](exec-plans/active/000-template.md)
- **Completed**: [`exec-plans/completed/`](exec-plans/completed/) — moved here with linked PRs
  - Latest: [`001-phase-1-domain-core.md`](exec-plans/completed/001-phase-1-domain-core.md)
- **Tech Debt**: [`exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md)

---

## References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — System architecture
