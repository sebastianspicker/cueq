# PLANS.md — Current Execution Plans & Phases

> This document summarizes where cueq is in its development lifecycle. For active execution plans, see [`exec-plans/active/`](exec-plans/active/).

---

## Current Phase: Phase 0 — Harness Foundation

**Goal**: Make the repo safe to receive code. Every future PR will be validated by CI, schemas, and tests.

**Status**: 🟡 In Progress

---

## Phase Overview

| Phase | Name | Goal | Status |
|---|---|---|---|
| **Phase 0** | Harness Foundation | CI, schemas, config, scripts, docs skeleton | 🟡 In Progress |
| **Phase 1** | Domain Core | Pure logic (time engine, absence, workflow, roster, closing, audit) with full unit tests | ⏳ Planned |
| **Phase 2** | Services + UI | API, adapters, frontend; 7/8 acceptance tests green | ⏳ Planned |
| **Phase 3** | Integrations + Ops | Terminal gateway, HR import, payroll export, backup/restore; pilot-ready | ⏳ Planned |

---

## Phase 0 — Harness Foundation (Current)

### Deliverables

| # | Deliverable | Status |
|---|---|---|
| 0.1 | Root config files (`tsconfig.json`, linter, formatter, `Makefile`, `docker-compose.yml`) | ⏳ Planned |
| 0.2 | CI pipeline (`.github/workflows/ci.yml`) | ⏳ Planned |
| 0.3 | JSON Schema stubs for all domain entities | ⏳ Planned |
| 0.4 | OpenAPI stub with health endpoint | ⏳ Planned |
| 0.5 | Fixture stubs (reference calculations) | ⏳ Planned |
| 0.6 | Test scaffolding (runner config, placeholder tests) | ⏳ Planned |
| 0.7 | Script stubs (`scripts/*.sh`) | ⏳ Planned |
| 0.8 | Documentation foundation (this PR: AGENTS.md, ARCHITECTURE.md, docs/) | 🟡 In Progress |
| 0.9 | Issue/PR templates | ⏳ Planned |
| 0.10 | ADR-001: Tech stack decision | ⏳ Planned |

### Definition of Done (Phase 0)

- [ ] `make check` passes on a fresh clone
- [ ] CI runs green on the default branch
- [ ] All schemas pass validation
- [ ] ADR-001 is written and merged
- [ ] A new contributor can run `make setup && make check` successfully

---

## Phase 1 — Domain Core

### Deliverables (Preview)

- `src/core/time-engine/`: time-type catalog, work-time models, plausibility checks, balance calculation
- `src/core/absence/`: leave quotas (pro-rata, carry-over, forfeiture)
- `src/core/workflow/`: approval state machine, delegation chain
- `src/core/roster/`: shift templates, min-staffing, plan-vs-actual
- `src/core/closing/`: month-end checklists, cut-off lock
- `src/core/audit/`: audit entry builder (append-only)
- Full JSON Schemas and type generation
- Reference calculation fixtures with real data
- >90% unit test coverage on `src/core/`

### Definition of Done (Phase 1)

- [ ] 4 reference calculations pass (flextime, shift/Pforte, part-time change, on-call/IT)
- [ ] Rule violations correctly detected per PRD
- [ ] Audit entries immutable by type-system design
- [ ] Domain glossary complete in `docs/design-docs/core-beliefs.md`

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
- **Tech Debt**: [`exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md)

---

## References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — System architecture
