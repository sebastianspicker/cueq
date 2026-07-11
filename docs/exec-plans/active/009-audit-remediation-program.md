# Exec Plan: Audit Remediation Program

> **Status:** 🟡 Active | **Owner:** Platform Team | **Started:** 2026-04-17 | **Target:** 2026-05-01

---

## Goal

Restore truthful green verification and fully remediate the correctness, privacy, contract, and operational issues identified in the 2026-04-17 repository audit.

## Context

The repository currently fails its own documented quality gates and contains a mix of verification drift, domain correctness bugs, authorization/privacy gaps, schema/runtime contract drift, and operations-tooling weaknesses.

Primary references:

- [docs/analysis/repo-audit-2026-04-17.md](../../analysis/repo-audit-2026-04-17.md)
- [docs/PLANS.md](../../PLANS.md)
- [docs/QUALITY_SCORE.md](../../QUALITY_SCORE.md)
- [docs/RELIABILITY.md](../../RELIABILITY.md)
- [docs/SECURITY.md](../../SECURITY.md)
- [AGENTS.md](../../../AGENTS.md)

This program must follow repo contribution constraints:

- One concern per PR
- Maximum 400 lines changed per PR excluding generated files
- Each slice must leave the repo in a verifiable state relative to the scope it touches

## Autonomous Decisions

These decisions remove ambiguity so remediation can proceed iteratively without waiting for additional product input.

1. **Absence dates become canonical date-only values.**
   - Reason: absence is modeled as day-based throughout runtime contracts and product specs.
   - Action: align JSON Schema, generated types, OpenAPI, fixtures, and docs to date-only semantics.

2. **Canonical identifier format becomes CUID across JSON Schema and Zod.**
   - Reason: runtime contracts already enforce this; the schema layer must stop accepting weaker IDs.

3. **Omitted `breakMinutes` means "not explicitly recorded", not zero recorded break.**
   - Reason: this matches current fixtures/tests and avoids false-positive deficits when systems only provide interval totals.
   - Explicit `breakMinutes: 0` continues to mean zero recorded break.

4. **A surcharge window with `start === end` means a full 24-hour window.**
   - Reason: this matches the current test expectation and gives deterministic configuration semantics.

5. **`APPROVED -> OPEN` reopen remains valid for `HR` and `ADMIN` until export.**
   - Reason: this matches current implementation intent better than the broken test and keeps `EXPORTED` periods on the stricter post-close-correction path.

6. **The persisted `Person` record becomes the authorization source of truth after authentication.**
   - Reason: token claims authenticate identity, but DB role/OU state must govern authorization and scoping.

7. **Frontend default API traffic uses relative `/api` routing.**
   - Reason: this matches Next.js rewrites and removes localhost coupling.

8. **Frontend privileged state must be cleared on auth/base-URL changes and on forbidden/failed refreshes.**
   - Reason: stale privileged data is a privacy bug.

9. **HR import becomes fail-closed and atomic.**
   - Reason: unknown roles and partial writes are data-integrity bugs, not operator convenience.

10. **Backup/restore verification becomes a real PostgreSQL backup/restore drill, not only a logical row replay.**
    - Reason: the current check is useful but does not validate disaster-recovery readiness.

## Scope

### In Scope

- Verification lane repair (`typecheck`, `test:unit`, `make quick`, `make check`)
- Core domain correctness fixes in `packages/core`
- API auth, scoping, overlap, and health-surface fixes in `apps/api`
- Frontend privacy, routing, endpoint, and state-hardening fixes in `apps/web`
- Shared-schema, JSON Schema, OpenAPI, and policy-contract alignment
- Prisma migration-history repair and DB-tooling hardening
- HR import and backup/restore operational correctness
- Documentation and generated-artifact reconciliation required by the above changes

### Out of Scope

- Net-new product features not required to resolve audited issues
- Broad UI redesign beyond the minimum needed to fix correctness/privacy/accessibility defects
- Deep architectural rewrites of otherwise-correct services
- New external integrations beyond those needed for current contract parity

## Success Criteria

- `pnpm typecheck` passes
- `pnpm test:unit` passes
- `make quick` matches its documented scope and passes
- `make check` matches its documented scope and passes
- `make test-all` passes
- Fresh database bootstrap via migrations succeeds on an empty database
- Backup/restore verification covers the full operational data set and performs a real restore drill
- Audit-identified privacy leaks and authorization drift paths are closed with regression coverage
- Contract layers are internally consistent: JSON Schema, Zod, generated types, OpenAPI, fixtures, and docs

## Workstreams

### WS-1 Verification Truthfulness

- Restore fast feedback loops first.
- Ensure each lane tests only what it claims.
- Align docs and harness scripts with actual verification behavior.

### WS-2 Domain Correctness

- Fix core calculation/state-machine issues before adapter-layer cleanup.
- Use fixtures and focused regression tests as the acceptance source for each rule change.

### WS-3 Auth, Privacy, and Surface Hardening

- Eliminate stale privileged state, cross-OU report access, and auth-source drift.
- Keep backend authorization authoritative; improve frontend behavior without relying on it for security.

### WS-4 Contract Reconciliation

- Remove schema/runtime/doc drift.
- Regenerate derived artifacts only after authoritative contracts are fixed.

### WS-5 Operations and Data Integrity

- Make migrations, import, and backup/restore trustworthy in clean environments and CI.

## Iteration Sequence

### Iteration 0: Baseline Recovery And Guardrails

**Objective**

Restore the shortest broken verification paths so the remaining work can proceed with reliable feedback.

**Changes**

- Fix `apps/api/src/phase2/helpers/roster-shift.helper.ts` typing without changing authorization behavior.
- Split `packages/database` unit and integration discovery so `test:unit` excludes DB connectivity tests.
- Reconcile red core tests with the autonomous decisions above:
  - omitted `breakMinutes`
  - `start === end` surcharge windows
  - reopen-from-approved closing semantics
- Add focused regression tests for each restored behavior.
- Keep changes scoped so `pnpm typecheck` and `pnpm test:unit` become trustworthy again.

**Verification**

- `pnpm typecheck`
- `pnpm test:unit`
- `make quick`

**Expected PR slices**

- PR-A: API typecheck fix only
- PR-B: database test-lane split only
- PR-C: core red-test semantic reconciliation only

### Iteration 1: Core Domain Rule Corrections

**Objective**

Resolve correctness defects in the pure domain layer while keeping API and UI changes out of scope for this slice.

**Changes**

- Rework flextime daily enforcement to aggregate by day rather than per booking.
- Reject or normalize overlapping intervals in time-rule evaluation so hours/surcharges are not double-counted.
- Clip prorating segments to the requested month and guard against overlap/double-counting.
- Canonicalize export checksum serialization so semantically identical payloads hash identically.
- Tighten roster plan-vs-actual coverage to consider meaningful duration coverage rather than any overlap.
- Replace loosely shaped violation contexts with stricter, code-aligned types where touched.

**Verification**

- `pnpm --filter @cueq/core test:unit`
- `pnpm --filter @cueq/core typecheck`
- fixture parity tests in `packages/core`

**Expected PR slices**

- PR-D: flextime/day aggregation
- PR-E: time-rule overlap normalization
- PR-F: prorating/checksum/roster coverage cleanup

### Iteration 2: Backend Authorization And Write-Path Hardening

**Objective**

Fix authorization drift, privacy bugs, and unsafe write paths in the API.

**Changes**

- Introduce a resolved actor/authorization context that uses `Person` as the source of truth for role and organization-unit scoping after identity authentication.
- Centralize role-policy constants to remove controller/service drift.
- Scope `closing-completion` for `TEAM_LEAD` to their own organization unit.
- Apply overlap detection consistently across:
  - manual bookings
  - closing corrections
  - on-call deployment bookings
  - terminal-import writes
- Treat `endTime = null` as an open booking during overlap checks.
- Align roster controller decorators with effective service policy.
- Split public liveness health from authenticated readiness/ops health.
- Implement webhook request signing using the stored secret or remove secret collection from the surface if no signing is possible in the same slice.

**Verification**

- `pnpm --filter @cueq/api typecheck`
- `pnpm --filter @cueq/api test:unit`
- targeted API integration/compliance suites covering cross-OU denial, stale-role denial, overlap rejection, and health visibility

**Expected PR slices**

- PR-G: authorization source-of-truth and policy alignment
- PR-H: report scoping and overlap fixes
- PR-I: health split and webhook signing

### Iteration 3: Frontend Privacy And Runtime Resilience

**Objective**

Remove stale-data leaks, fix endpoint/routing issues, and make the frontend usable outside localhost-only assumptions.

**Changes**

- Default API client base to relative `/api` and use the existing Next rewrite path.
- Persist API connection settings across route remounts using the least invasive client-side persistence mechanism required for current flows.
- Clear privileged state immediately when token/base URL changes and whenever a restricted refresh fails.
- Fix the audit page to call the actual supported endpoint surface.
- Clear stale page results before and after failed requests on affected pages.
- Make locale handling correct:
  - dynamic `html lang`
  - preserve current route on locale switch
  - stop forcing all root flows to `/de/dashboard` when locale information exists
- Wire settings persistence to actual reads so saved preferences take effect.
- Expand route-level browser coverage for reports, policy admin, audit, settings, locale switching, and stale-data regression cases.

**Verification**

- `pnpm --filter @cueq/web typecheck`
- `pnpm --filter @cueq/web test:unit`
- frontend acceptance and a11y suites
- user-surface probe through Playwright on at least one restricted route and one locale-switch flow

**Expected PR slices**

- PR-J: API base/state clearing/audit endpoint
- PR-K: locale and settings behavior
- PR-L: frontend regression coverage expansion

### Iteration 4: Contract, Schema, And Documentation Reconciliation

**Objective**

Make every contract layer agree with the implemented runtime behavior after Iterations 0-3.

**Changes**

- Align absence contracts to date-only semantics in JSON Schema, shared contracts, generated types, and OpenAPI.
- Strengthen canonical ID schema definitions to CUID.
- Reconcile event contracts by comparing actual emitters with shared schema and product docs:
  - if emitters already exist, extend the shared schema and tests
  - otherwise narrow docs to the actually supported events
- Make entity JSON Schemas require the fields runtime read models require where those schemas represent persisted reads.
- Tighten workflow decision schemas so contradictory `action` + legacy `decision` payloads are rejected.
- Add missing chronological/effective-change validation to booking, closing, workflow, report, absence, and on-call queries.
- Disallow empty break-threshold policy bundles.
- Update policy docs/changelog to reflect the real rule surface, including `SURCHARGE_RULE`.
- Regenerate artifacts after authoritative contracts are fixed.

**Verification**

- `pnpm --filter @cueq/shared typecheck && pnpm --filter @cueq/shared test:unit`
- `pnpm --filter @cueq/policy typecheck && pnpm --filter @cueq/policy test:unit`
- `make schemas`
- `make generate`
- `make openapi-check`
- `make docs-check`

**Expected PR slices**

- PR-M: absence/ID/entity schema alignment
- PR-N: workflow/query validation tightening
- PR-O: event/policy/doc reconciliation and regenerated artifacts

### Iteration 5: Database Migration Repair And Tooling Truthfulness

**Objective**

Make database setup and verification truthful for clean environments and CI.

**Changes**

- Replace the incomplete migration chain with a coherent, replayable path from an empty database to the current schema.
  - Because the project is still pre-release, rewriting the migration baseline is acceptable and safer than layering ad hoc repair migrations on top of an invalid history.
- Ensure migrated schema matches `schema.prisma`, including `LeaveAdjustment.deltaDays` precision.
- Add a clean-database migrate/deploy verification step in CI and local harness scripts.
- Make `make check` / `scripts/check.sh` run the full documented validation surface.
- Isolate API integration suites with their own schemas, matching acceptance/compliance isolation.
- Convert HR import to a validate-first, transaction-backed, fail-closed flow.
- Add validation coverage for CSV integration fixtures.

**Verification**

- clean database bootstrap using `prisma migrate deploy`
- `pnpm test:integration`
- `make quick`
- `make check`

**Expected PR slices**

- PR-P: migration baseline repair
- PR-Q: check/integration-lane truthfulness
- PR-R: HR import hardening and CSV fixture validation

### Iteration 6: Backup/Restore And Disaster-Recovery Verification

**Objective**

Upgrade backup/restore verification from logical replay to a real operational drill.

**Changes**

- Include omitted operational tables such as workflow policy/delegation state in backup coverage.
- Replace or wrap the current logical-copy script with a true PostgreSQL backup/restore flow using `pg_dump` and `pg_restore` against isolated temporary databases.
- Verify row counts, checksums, sequence state, and the presence of critical operational configuration after restore.
- Keep the current logical parity checks only if they still add signal beyond the real restore drill.
- Update acceptance/compliance/ops docs to describe the actual guarantee being tested.

**Verification**

- `make test-backup-restore`
- acceptance scenario covering AT-08 expectations
- explicit restore parity assertions for workflow policy/delegation data and audit continuity

**Expected PR slices**

- PR-S: backup coverage completion
- PR-T: real backup/restore drill implementation and docs

### Iteration 7: Final Reconciliation And Closeout

**Objective**

Prove the repository is internally consistent, operationally truthful, and back to green.

**Changes**

- Remove any now-obsolete comments/tests/docs that referenced superseded behavior.
- Update the audit artifact with a resolved-status appendix or create a closeout note under `docs/analysis/`.
- Update any active execution-plan references if the remediation program spans multiple merged PRs.

**Verification**

- `make check`
- `make test-all`
- `make build`
- `pnpm docs:links`
- surface probe:
  - start API and web
  - curl authenticated and unauthenticated health/readiness surfaces
  - run one Playwright smoke path through a privileged route and a locale-switch path

## Task Checklist

- [ ] Iteration 0 complete
- [ ] Iteration 1 complete
- [ ] Iteration 2 complete
- [ ] Iteration 3 complete
- [ ] Iteration 4 complete
- [ ] Iteration 5 complete
- [ ] Iteration 6 complete
- [ ] Iteration 7 complete
- [ ] All verification gates green
- [ ] Audit closeout artifact written

## Definition of Done

- [ ] All iterations above completed or explicitly moved to a separate tracked plan
- [ ] `make check` passes
- [ ] `make test-all` passes
- [ ] Fresh migration bootstrap passes on an empty database
- [ ] Backup/restore drill is real and green
- [ ] Documentation and generated artifacts match implementation
- [ ] PR slices are linked below

## Linked PRs / Issues

| PR/Issue          | Description                           | Status      |
| ----------------- | ------------------------------------- | ----------- |
| Audit 2026-04-17  | Source audit baseline                 | ✅ Complete |
| PR-A              | API typecheck repair                  | ⏳ Pending  |
| PR-B              | Database unit/integration lane split  | ⏳ Pending  |
| PR-C              | Core red-test semantic reconciliation | ⏳ Pending  |
| PR-D through PR-T | Follow-on remediation slices          | ⏳ Pending  |

## Risks / Blockers

| Risk                                                          | Mitigation                                                                                        | Status    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| Migration-baseline rewrite may invalidate local dev databases | Treat as pre-release reset, document re-bootstrap path, verify on empty DB in CI before merge     | 🟡 Active |
| Contract alignment may regenerate large artifacts             | Keep authoritative contract changes and generated outputs in the same narrow slice                | 🟡 Active |
| Frontend token persistence can introduce new privacy concerns | Use minimal persistence scope, clear aggressively on logout/error, avoid broad long-lived storage | 🟡 Active |
| Full backup/restore drill may require CI environment changes  | Implement isolated temp databases and explicit tool checks early in the slice                     | 🟡 Active |
| Partial fixes may create false greens                         | Every slice adds a regression test for the specific failure mode it closes                        | 🟡 Active |

## Notes

- Execution order matters. Iteration 0 must land before broader refactors so later work runs against truthful lanes.
- Contract/doc changes should follow implementation changes in the same slice when behavior is intentionally changed.
- If any iteration exceeds the 400-line PR policy, split the slice without mixing concerns.
