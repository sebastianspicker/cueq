# Release Candidate Gap Matrix — 2026-03-01 (MVP-Committed Scope)

## Scope

- PRD/MVP proxy inputs: `docs/product-specs/*.md`, `docs/PLANS.md`, `docs/exec-plans/*`.
- Repo idea/constraints inputs: `README.md`, `docs/PRODUCT_SENSE.md`, `ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/RELIABILITY.md`.
- Scope lock: committed MVP (`FR-100..FR-700`) only; deferred roadmap tracked separately.

## RC Evaluation Model

### Status Legend

- `implemented`: shipped and evidenced in code/tests/contracts/docs.
- `implemented-doc-stale`: behavior implemented; documentation inconsistent.
- `partial`: partially implemented or partially evidenced.
- `external-confirmation`: requires proof outside local branch snapshot.
- `deferred`: intentionally out of scope for MVP RC.

### Release Impact Legend

- `RC-Blocker`: must be closed for release-candidate sign-off.
- `RC-Risk`: does not block branch-level RC status but prevents final default-branch release sign-off.
- `Non-blocking`: no RC impact in current scope.

## Empirical Validation Snapshot

| Command         | Date       | Result  | Notes                                                                                    |
| --------------- | ---------- | ------- | ---------------------------------------------------------------------------------------- |
| `make test-all` | 2026-03-01 | ✅ Pass | Unit + integration + acceptance (`AT-01..AT-08`) + compliance + backup/restore succeeded |
| `make check`    | 2026-03-01 | ✅ Pass | Lint/format/typecheck/docs links/schemas/tests/policy golden/openapi check succeeded     |

## Requirement Matrix

| Group                   | ID                               | Requirement                                                       | Evidence                                                                                                                                                   | Status                | Release Impact                                               | Owner               | Closure Action                                                                                             |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Feature parity          | FR-100                           | New-user onboarding (orientation + first booking path)            | `apps/api/test/integration/fr100.integration.test.ts`, `apps/web/tests/acceptance/phase2.acceptance.spec.ts`                                               | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-200                           | Time engine rules                                                 | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`, `apps/api/src/phase2/controllers/time-engine.controller.ts`                            | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-300                           | Roster/shift planning                                             | `apps/api/test/integration/phase3.integration.test.ts`, `apps/web/src/app/[locale]/roster/page.tsx`                                                        | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-400                           | Absence/leave                                                     | `apps/api/test/integration/fr400.integration.test.ts`, `apps/web/tests/acceptance/phase2.acceptance.spec.ts`                                               | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-500                           | Workflows/approvals core + swap/overtime flows                    | `apps/api/test/integration/fr500.integration.test.ts`, `apps/api/src/phase2/controllers/workflows.controller.ts`                                           | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-600                           | Monthly closing                                                   | `apps/api/test/acceptance/phase2.acceptance.test.ts`, `apps/web/src/app/[locale]/closing/page.tsx`                                                         | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | FR-700                           | Reports/export (CSV+XML, artifact endpoint, custom builder)       | `apps/api/test/integration/openapi.contract.test.ts`, `apps/api/test/integration/phase3.integration.test.ts`, `apps/web/src/app/[locale]/reports/page.tsx` | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Feature parity          | TRACE-PRD                        | Traceability scope references FR-100..FR-700 only                 | `docs/product-specs/index.md` traceability section                                                                                                         | implemented           | Non-blocking                                                 | Product/Eng         | None                                                                                                       |
| Quality/operations      | QG-CHECK                         | Validation harness (`make check`) green                           | local command run on 2026-03-01                                                                                                                            | implemented           | Non-blocking                                                 | Engineering         | Keep required in CI                                                                                        |
| Quality/operations      | QG-TEST-ALL                      | Full test suites (`make test-all`) green                          | local command run on 2026-03-01                                                                                                                            | implemented           | Non-blocking                                                 | Engineering         | Keep required in CI                                                                                        |
| Quality/operations      | AT-01..AT-08                     | Phase 3 acceptance completeness                                   | `apps/api/test/acceptance/phase2.acceptance.test.ts`, `docs/product-specs/phase-3-acceptance-scenarios.md`                                                 | implemented           | Non-blocking                                                 | QA/Engineering      | None                                                                                                       |
| Quality/operations      | PILOT-GATE                       | Pilot readiness checklist fully green                             | `docs/PILOT_READINESS_CHECKLIST.md`                                                                                                                        | implemented           | Non-blocking                                                 | Product/Ops         | None                                                                                                       |
| Quality/operations      | OPS-DRILL                        | Weekly backup/restore drill configured                            | `.github/workflows/backup-restore-weekly.yml`, `docs/OPERATIONS_RUNBOOK.md`                                                                                | implemented           | Non-blocking                                                 | Ops                 | None                                                                                                       |
| Governance/traceability | GOV-REPORT-REVIEW-EVIDENCE       | Reporting privacy review evidence linkage and artifact            | `docs/design-docs/reporting-privacy-review-log.md`, `.github/pull_request_template.md`, `docs/product-specs/privacy-reporting-guardrails.md`               | implemented           | Non-blocking                                                 | Security/Governance | None                                                                                                       |
| Governance/traceability | DOC-PH2-SPEC-STATUS              | Phase 2 acceptance status aligned to historical complete baseline | `docs/product-specs/phase-2-acceptance-scenarios.md`, `docs/product-specs/index.md`                                                                        | implemented           | Non-blocking                                                 | Product/Docs        | None                                                                                                       |
| Governance/traceability | DOC-ONBOARDING-PRIVACY-CHECKLIST | Onboarding privacy checklist closure with evidence note           | `docs/product-specs/new-user-onboarding.md`                                                                                                                | implemented           | Non-blocking                                                 | Product/Docs        | None                                                                                                       |
| Governance/traceability | GOV-PH0-DOD-2                    | Phase 0 DoD default-branch CI confirmation                        | `docs/PLANS.md` (`CI runs green on the default branch`)                                                                                                    | external-confirmation | RC-Blocker (default-branch sign-off) / RC-Risk (branch-only) | Release Manager     | After merge, add workflow URL + commit SHA + date under Phase 0 DoD and mark closed in reconciliation docs |

## Missing for RC Sign-off (MVP Scope)

1. `GOV-PH0-DOD-2` remains open until default-branch CI proof is linked in `docs/PLANS.md`.

## Deferred / Out-of-Scope (Non-blocking)

- Workflow admin UI for workflow policies/delegations.
- Unrestricted/free-form report SQL builder.
- Mobile onboarding and supervisor-side new-hire view.
- eAU integration and automated leave-planning recommendations.
