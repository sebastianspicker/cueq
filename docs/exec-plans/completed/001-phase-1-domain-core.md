# Exec Plan: Phase 1 Domain Core

> **Status:** ✅ Completed | **Owner:** Core Domain Team | **Started:** 2026-02-28 | **Target:** 2026-03-31

---

## Goal

Deliver Phase 1 pure domain logic in `@cueq/core` with deterministic fixture parity, policy-rule violations, append-only audit modeling, and >90% unit coverage on core modules.

## Context

Phase 1 in [docs/PLANS.md](../../PLANS.md) requires implementation of time engine, absence, workflow, roster, closing, and audit core logic with no I/O dependencies. The current repository is scaffolded, but core domain execution logic is missing.

## Scope

### In Scope

- New package `packages/core` (`@cueq/core`) for pure domain logic only
- Scenario-first implementation for 4 reference fixtures:
  - flextime
  - pforte shift
  - part-time change
  - IT on-call
- Workflow transition engine and delegation chain resolution
- Closing checklist generation and cut-off lock semantics
- Immutable audit entry builder API
- Core-domain JSON schemas and generated TypeScript contracts
- Core coverage gate (`>=90%` lines for `packages/core/src/core/**`)
- Glossary completion and Phase 1 documentation updates

### Out of Scope

- External adapters (Honeywell, payroll wire format, SSO)
- DB persistence implementation for core logic
- API/controller wiring (Phase 2)
- UI feature implementation (Phase 2)

## Task Sequence

- [x] Create active execution plan with traceability and risk register
- [x] Scaffold `@cueq/core` package and purity guardrails
- [x] Implement `calculateFlextimeWeek` + plausibility checks
- [x] Implement `evaluateShiftCompliance` and min-staffing checks
- [x] Implement `calculateProratedMonthlyTarget` and leave quota helpers
- [x] Implement `evaluateOnCallRestCompliance`
- [x] Implement workflow transition matrix and delegation chain
- [x] Implement closing checklist and cut-off lock
- [x] Implement immutable audit entry builder API
- [x] Add core JSON schemas and type generation wiring
- [x] Add fixture parity + violation matrix + coverage gates
- [x] Update glossary and phase status docs

## Phase 1 DoD Traceability

| Phase 1 DoD Requirement                       | Implementation / Validation                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| 4 reference calculations pass                 | `packages/core/src/core/**/__tests__/fixture-parity.test.ts` and module tests |
| Rule violations detected per PRD              | Violation matrix tests in `time-engine` and `roster` suites                   |
| Audit entries immutable by type-system design | `DeepReadonly<T>` + audit typecheck tests                                     |
| Domain glossary complete                      | Updated `docs/design-docs/core-beliefs.md`                                    |

## Linked PRs / Issues

| PR/Issue                    | Description                                     | Status         |
| --------------------------- | ----------------------------------------------- | -------------- |
| Local implementation bundle | Phase 1 domain core rollout on workspace branch | ✅ Implemented |

## Risks / Blockers

| Risk                                   | Mitigation                                                                    | Status       |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| TD-006 Honeywell protocol unknown      | Keep protocol as adapter boundary; expose domain input ports only             | 🟡 Tracked   |
| TD-007 Payroll export format undefined | Keep closing output schema internal and format-agnostic                       | 🟡 Tracked   |
| TD-008 NRW holiday dataset missing     | Add machine-readable NRW holiday fixture dataset for deterministic rule tests | ✅ Mitigated |

## PR Cadence and Guardrails

- One concern per PR-sized slice (scenario-first ordering)
- Keep manual changes near 400 LOC where possible
- `make check` required for merge readiness
- No PII in fixtures; synthetic or anonymized-derived data only

## Notes

This execution plan is intentionally scenario-first to keep legal calculation behavior verifiable from the start and to avoid broad speculative abstractions.
