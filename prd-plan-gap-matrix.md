# PRD/Plan vs Repo Gap Matrix — 2026-03-01 Refresh

## Scope and Method

- PRD proxy inputs: `docs/product-specs/*.md`, `docs/PLANS.md`, `docs/exec-plans/*`.
- Implementation evidence: `apps/api`, `apps/web`, `packages/*`, `contracts/openapi/openapi.json`, CI/scripts.
- Validation run in this snapshot:
  - `make check` (pass)
  - `make test-all` (pass)

## Status Legend

- `implemented`: shipped and evidenced in code/tests/contracts.
- `implemented-doc-stale`: functionality shipped, but docs/status text is not fully reconciled.
- `partial`: partially addressed; still requires explicit closure evidence.
- `external-confirmation`: cannot be proven from local branch alone.
- `deferred`: intentionally out of scope per current spec.

## Requirement Matrix

| ID                               | Requirement                                                      | Source                                                                                                                                       | Evidence                                                                                                                                                   | Status                | Blocking |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| FR-100                           | New-user onboarding (orientation + first booking path)           | `docs/product-specs/new-user-onboarding.md`                                                                                                  | `apps/api/test/integration/fr100.integration.test.ts`, `apps/web/tests/acceptance/phase2.acceptance.spec.ts`                                               | implemented           | No       |
| FR-200                           | Time engine rules                                                | `docs/product-specs/time-engine-rules.md`                                                                                                    | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`, `apps/api/src/phase2/controllers/time-engine.controller.ts`                            | implemented           | No       |
| FR-300                           | Roster/shift planning                                            | `docs/product-specs/roster-shift-planning.md`                                                                                                | `apps/api/test/integration/phase3.integration.test.ts`, `apps/web/src/app/[locale]/roster/page.tsx`                                                        | implemented           | No       |
| FR-400                           | Absence/leave                                                    | `docs/product-specs/absence-leave.md`                                                                                                        | `apps/api/test/integration/fr400.integration.test.ts`, `apps/web/tests/acceptance/phase2.acceptance.spec.ts`                                               | implemented           | No       |
| FR-500                           | Workflows/approvals core                                         | `docs/product-specs/workflows-approvals.md`                                                                                                  | `apps/api/test/integration/fr500.integration.test.ts`, `apps/web/src/app/[locale]/approvals/page.tsx`                                                      | implemented           | No       |
| FR-500.1                         | Shift swap flow (`POST /v1/workflows/shift-swaps`)               | `docs/product-specs/workflows-approvals.md`                                                                                                  | `apps/api/src/phase2/controllers/workflows.controller.ts`, `apps/api/test/integration/fr500.integration.test.ts`                                           | implemented           | No       |
| FR-500.2                         | Overtime approval flow (`POST /v1/workflows/overtime-approvals`) | `docs/product-specs/workflows-approvals.md`                                                                                                  | `apps/api/src/phase2/controllers/workflows.controller.ts`, `apps/api/test/integration/fr500.integration.test.ts`                                           | implemented           | No       |
| FR-600                           | Monthly closing                                                  | `docs/product-specs/monthly-closing.md`                                                                                                      | `apps/api/test/acceptance/phase2.acceptance.test.ts`, `apps/web/src/app/[locale]/closing/page.tsx`                                                         | implemented           | No       |
| FR-700                           | Reports/export (CSV+XML, artifact endpoint, custom builder)      | `docs/product-specs/reports-export.md`                                                                                                       | `apps/api/test/integration/openapi.contract.test.ts`, `apps/api/test/integration/phase3.integration.test.ts`, `apps/web/src/app/[locale]/reports/page.tsx` | implemented           | No       |
| TRACE-PRD                        | Traceability scope references FR-100..FR-700 only                | `docs/product-specs/index.md`                                                                                                                | `docs/product-specs/index.md` traceability section                                                                                                         | implemented           | No       |
| GOV-PH0-DOD-2                    | Phase 0 DoD default-branch CI confirmation                       | `docs/PLANS.md`                                                                                                                              | Explicit unchecked item requiring merge/default-branch proof                                                                                               | external-confirmation | No       |
| DOC-PH2-SPEC-STATUS              | Phase 2 acceptance spec status alignment                         | `docs/product-specs/index.md`, `docs/product-specs/phase-2-acceptance-scenarios.md`, `docs/PLANS.md`                                         | Phase 2 acceptance spec/index now marked complete as historical baseline                                                                                   | implemented           | No       |
| GOV-REPORT-REVIEW-EVIDENCE       | Works-council/privacy review evidence trail                      | `docs/product-specs/privacy-reporting-guardrails.md`, `.github/pull_request_template.md`, `docs/design-docs/reporting-privacy-review-log.md` | Review artifact contract and baseline evidence entry added; PR template now requires linkage                                                               | implemented           | No       |
| DOC-ONBOARDING-PRIVACY-CHECKLIST | Onboarding privacy checklist closure                             | `docs/product-specs/new-user-onboarding.md`                                                                                                  | Privacy checklist now closed with explicit evidence mapping                                                                                                | implemented           | No       |

## Remaining PRD Work (Actionable)

1. `GOV-PH0-DOD-2` (P2 external): attach default-branch CI run URL + commit SHA after merge.

## Deferred / Roadmap (Not Current Blockers)

- Workflow admin UI for workflow policies/delegations (`docs/product-specs/workflows-approvals.md` out-of-scope section).
- Unrestricted/free-form report SQL builder (`docs/product-specs/reports-export.md` out-of-scope section).
- Mobile onboarding and supervisor-specific new-hire view (`docs/product-specs/new-user-onboarding.md` out-of-scope section).
- eAU integration and automated leave-planning recommendations (`docs/product-specs/absence-leave.md` out-of-scope section).
