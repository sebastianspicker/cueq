# AUDIT.md

> Repo audit report for `cueq`
> Date: 2026-04-07 17:40:01 CEST
> Scope: correctness, verification integrity, test/lint/typecheck status, and repo-internal contract drift
> Constraint: no code fixes applied in this audit pass

---

## Executive Summary

The repository is not currently in a releasable or "pilot-ready" state by its own documented standards.

Verified blockers:

1. `@cueq/api` fails typecheck.
2. `@cueq/core` fails unit tests.
3. `@cueq/database` "unit" tests require a live database and fail without Postgres.
4. Project status documents claim green verification that does not match the current workspace state.

As a result, `pnpm typecheck`, `pnpm test:unit`, and by extension `make quick` / `make check` are not reliable green gates at the moment.

---

## Audit Method

Commands run during the audit:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --filter @cueq/api typecheck
pnpm --filter @cueq/core test:unit
pnpm --filter @cueq/database test:unit
```

Observed outcomes:

- `pnpm lint`: passes with warnings
- `pnpm typecheck`: fails
- `pnpm test:unit`: fails
- `@cueq/api` isolated typecheck: fails
- `@cueq/core` isolated unit tests: fail
- `@cueq/database` isolated unit tests: fail without local Postgres on `localhost:5433`

---

## Findings

### 1. High: API typecheck is broken in roster write authorization

**Affected files**

- `apps/api/src/phase2/helpers/roster-shift.helper.ts`

**Evidence**

- `tsc --noEmit` fails in `@cueq/api`
- Failing lines are the `includes(user.role)` checks in `assertCanWriteRoster`

Relevant code:

```ts
if (![Role.SHIFT_PLANNER, Role.HR, Role.ADMIN].includes(user.role)) {
if (![Role.HR, Role.ADMIN].includes(user.role) && actorOuId !== rosterOuId) {
```

TypeScript error:

```text
Argument of type 'Role' is not assignable to parameter of type '"SHIFT_PLANNER" | "HR" | "ADMIN"'.
Type '"EMPLOYEE"' is not assignable to type '"SHIFT_PLANNER" | "HR" | "ADMIN"'.
```

**Impact**

- `pnpm typecheck` fails
- `make check` cannot pass
- the repo’s main static verification gate is broken

**Why this matters**

This is not just a narrow helper problem. It invalidates the repo’s stated "green" quality gates and blocks CI/local merge confidence.

**Proposed fix**

Use a role-checking structure that accepts the full `Role` input type without narrowing mismatch.

Minimal options:

1. Replace `Array.includes(...)` with explicit equality checks:
   - `user.role !== Role.SHIFT_PLANNER && user.role !== Role.HR && user.role !== Role.ADMIN`
2. Or use a `Set<Role>` typed as `ReadonlySet<Role>` and check `.has(user.role)`
3. Add a focused regression test for `assertCanWriteRoster` covering `EMPLOYEE`, `SHIFT_PLANNER`, `HR`, and `ADMIN`

Preferred fix: option 1 or 2, whichever matches existing style in the API helpers.

---

### 2. High: `packages/database` unit-test lane is misconfigured and runs integration tests

**Affected files**

- `packages/database/package.json`
- `packages/database/vitest.config.ts`
- `packages/database/src/__tests__/database.integration.test.ts`

**Evidence**

`packages/database/package.json` currently defines:

```json
"test:unit": "vitest run"
```

`packages/database/vitest.config.ts` currently includes:

```ts
include: ['src/**/*.test.ts'];
```

That includes:

- `src/__tests__/database.integration.test.ts`

The integration test hardcodes a local default:

```ts
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
```

Observed failure:

```text
Can't reach database server at `localhost:5433`
```

**Impact**

- `pnpm test:unit` fails on machines without a running local database
- `make quick` is not actually a fast/unit-only lane
- unit/integration boundaries are not trustworthy

**Why this matters**

The repo explicitly documents `make quick` as "lint + typecheck + unit tests only". The current wiring violates that contract.

**Proposed fix**

Separate unit and integration test discovery for `@cueq/database`.

Minimal options:

1. Rename the integration test file so it no longer matches the unit glob
   - for example `database.integration.spec.ts` plus unit config that excludes `*.integration.*`
2. Change `test:unit` to explicitly target only smoke/compliance/unit-safe files
3. Add a dedicated integration Vitest config and ensure only `test:integration` uses it
4. Document the DB requirement only on the integration lane, not on the unit lane

Preferred fix: explicit include/exclude patterns so `test:unit` and `test:integration` are structurally distinct.

---

### 3. High: Flextime implementation drift breaks fixture parity and Phase 1 contract

**Affected files**

- `packages/core/src/core/time-engine/flextime.ts`
- `packages/core/src/core/time-engine/__tests__/flextime.test.ts`
- `packages/core/src/core/__tests__/fixture-parity.test.ts`
- `fixtures/reference-calculations/flextime.json`
- `docs/PLANS.md`

**Evidence**

Current implementation:

```ts
if ((booking.breakMinutes ?? 0) < expectedBreak) {
```

Current test expectation:

```ts
it('no break deficit when workedHours exactly 6 and breakMinutes omitted', () => {
```

Committed fixture expectation:

```json
"expected": {
  "actualHours": 40.3,
  "deltaHours": 0.47,
  "violations": []
}
```

Observed failure in `@cueq/core`:

- omitted `breakMinutes` now generates `BREAK_DEFICIT`
- the flextime fixture parity test fails
- the dedicated flextime test fails

**Impact**

- `@cueq/core` unit suite is red
- documented Phase 1 DoD claim "4 reference calculations pass" is false in the current workspace
- the repo no longer has a stable contract for how missing break data should be interpreted

**Why this matters**

This is a contract drift problem across implementation, tests, fixtures, and phase documentation. One of these is wrong, but the repo currently claims all are aligned.

**Proposed fix**

Make one authoritative decision about omitted `breakMinutes`, then align all layers to that decision.

Two valid directions:

1. Treat omitted `breakMinutes` as "unknown / not explicitly recorded", preserving legacy fixture behavior
   - update `flextime.ts` back to fallback semantics compatible with the tests/fixtures
2. Treat omitted `breakMinutes` as zero recorded break
   - keep implementation behavior
   - update fixture(s), tests, and any product/schema docs that imply omission is acceptable

Preferred fix: choose based on domain intent, then update code, fixtures, tests, and plan docs together in one reviewable change. Do not patch only one layer.

---

### 4. Medium: Closing state machine rules are internally inconsistent

**Affected files**

- `packages/core/src/core/closing/index.ts`
- `packages/core/src/core/closing/__tests__/closing.test.ts`
- `docs/product-specs/monthly-closing.md`

**Evidence**

Implementation allows:

```ts
if (input.action === 'REOPEN') {
  if (input.currentStatus !== 'REVIEW' && input.currentStatus !== 'APPROVED') {
```

But the test suite expects `APPROVED -> REOPEN` to be invalid:

```ts
expect(reopenFromApproved.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');
```

The product spec is also mixed:

- state diagram says `Review --> Open: Reopen (HR only, audited)`
- prose says `Reopen clears lead and HR approvals and returns period to OPEN`

**Impact**

- `@cueq/core` unit suite is red
- state-machine behavior is ambiguous for reviewers and future changes
- API/service behavior can drift from the core transition model

**Why this matters**

This is a domain rule disagreement, not just a flaky test. The repo currently contains two incompatible definitions of valid reopening behavior.

**Proposed fix**

Choose one reopen model and align core tests, core implementation, and the product spec.

Options:

1. `REVIEW -> OPEN` only
   - keep reopen narrow
   - require `APPROVED ->` another audited route if reopening is needed
2. `REVIEW -> OPEN` and `APPROVED -> OPEN`
   - keep current implementation
   - update tests and product spec accordingly

Preferred fix: decide from product/domain requirements first, then align all three layers in a single change.

---

### 5. Medium: Surcharge window helper contradicts its own test contract

**Affected files**

- `packages/core/src/core/time-engine/surcharge.ts`
- `packages/core/src/core/time-engine/__tests__/surcharge.test.ts`

**Evidence**

Implementation:

```ts
if (startMinute === endMinute) {
  return false;
}
```

Test contract:

```ts
it('returns true for all minutes when start === end (full 24h window)', () => {
```

Observed failure:

- `isWithinWindow(0, 720, 720)` returns `false`
- test expects `true`

**Impact**

- `@cueq/core` unit suite is red
- helper semantics are ambiguous for future policy extensions

**Why this matters**

Even if current default surcharge config does not use `start === end`, the helper’s documented behavior and implementation disagree. That makes future rule configuration risky.

**Proposed fix**

Pick one semantic and make code plus tests agree.

Options:

1. `start === end` means a full 24-hour window
2. `start === end` means an empty window and should probably be rejected at schema/policy validation time instead

Preferred fix: if this helper is intended for policy-driven windows, reject invalid configuration early or explicitly support full-day semantics, but do not leave the mismatch in place.

---

### 6. Medium: Repo status documents overstate verification health

**Affected files**

- `docs/PLANS.md`
- `docs/PILOT_READINESS_CHECKLIST.md`
- `README.md`

**Evidence**

Current docs claim:

- `make check` passes on a fresh clone
- all 8 acceptance tests pass
- pilot readiness checklist is fully green
- quick start tells contributors to expect `make check` as the validation step

Current observed reality:

- `pnpm typecheck` fails
- `pnpm test:unit` fails
- `@cueq/core` is red
- `@cueq/database` unit lane is not isolated

**Impact**

- contributors and reviewers are given false confidence
- the documented Definition of Done is not currently true
- auditability is weakened because repo status claims are stale

**Why this matters**

This is a process integrity issue. When docs say the quality gate is green and it is not, the docs stop being operationally useful.

**Proposed fix**

Reconcile status documentation after the code/test issues are fixed.

Minimal approach:

1. Do not claim green verification until `make check` and `make test-all` pass again
2. Update `docs/PLANS.md` and `docs/PILOT_READINESS_CHECKLIST.md` to reflect current status
3. If the branch is intentionally ahead/behind another branch, say so explicitly with date and branch context

Preferred fix: tie status claims to an actual command run and date, not a stale checkbox.

---

## Secondary Observations

These are not the main blockers, but they are worth tracking:

- `pnpm lint` passes with warnings, so the repo is not lint-clean
- `apps/api/src/phase2/helpers/closing-checklist.helper.ts` contains a TODO noting hardcoded ArbZG thresholds instead of policy-driven values
- Turbo cache/log output references another repo path in some cached entries (`01_high/01_high_cueq`), which may be harmless cache metadata, but is worth checking if cross-workspace cache reuse becomes confusing

---

## Recommended Fix Order

1. Restore `@cueq/api` typecheck
2. Repair test-lane separation in `@cueq/database`
3. Resolve flextime contract drift across code/tests/fixtures/docs
4. Resolve closing state-machine ambiguity
5. Resolve surcharge helper contract mismatch
6. Re-run:
   - `pnpm typecheck`
   - `pnpm test:unit`
   - `make quick`
   - `make check`
7. Only after green verification, reconcile status docs

---

## Current Verdict

```text
VERDICT: FAIL
```
