# Missing Items (Ranked) — RC View (2026-03-01)

## Summary

- MVP-committed scope (`FR-100..FR-700`) has no open functional implementation gaps.
- One external governance proof remains before default-branch RC sign-off.

## RC-Blockers

1. **`GOV-PH0-DOD-2`** (`external-confirmation`)
   - Missing: explicit default-branch `CI` success evidence.
   - Source: `docs/PLANS.md` Phase 0 DoD (`CI runs green on the default branch`).
   - Why blocking: final RC sign-off requires proof on `main`, not only on a feature branch.

## RC-Risks (Non-blocking on branch)

1. **Branch/default divergence risk until merge**
   - Branch-level checks are green, but release decision can drift until `main` run is captured.
   - Mitigation: perform post-merge proof capture immediately and reconcile docs in one follow-up docs-only PR.

## Non-blocking Deferred

1. Workflow admin UI for policies/delegations.
2. Unrestricted/free-form SQL-style report builder.
3. Mobile onboarding and supervisor-side new-hire view.
4. eAU integration and automated leave-planning recommendations.

## Closure Runbook for Open Blocker

### `GOV-PH0-DOD-2` Closure Steps

1. Merge the current RC candidate branch into `main`.
2. Wait for `CI` workflow on `main` to complete successfully.
3. Capture three proof fields:
   - workflow run URL
   - commit SHA
   - run date (`YYYY-MM-DD`)
4. Update `docs/PLANS.md`:
   - change checkbox to `[x]` for default-branch CI
   - add evidence line: `Evidence: <url> (commit <sha>, date <yyyy-mm-dd>)`
5. Reconcile status artifacts:
   - mark `GOV-PH0-DOD-2` as closed in `prd-plan-gap-matrix.md`
   - remove it from this file
   - update `status-reconciliation.md` verdict to `RC ready on default branch: Yes`
6. Run final validation commands:
   - `pnpm docs:links`
   - `make check`
