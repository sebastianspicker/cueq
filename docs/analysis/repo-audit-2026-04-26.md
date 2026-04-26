# Repository Deep Audit — 2026-04-26

## Scope and Method

This document records a deeper repository audit pass covering architecture fit, delivery harness behavior, cross-package integration points, and remediation work performed during the pass.

Audit method used:

1. Read baseline architecture/design/plan/spec documents.
2. Inspect package/app structure and key module boundaries (`apps/api`, `apps/web`, `packages/*`, `scripts/*`).
3. Run repository health gates (`make quick`, `make docs-check`).
4. Triage failures/warnings by severity (`P0`, `P1`, `P2`) and implement confirmed remediations.
5. Re-run checks to validate outcomes.

## How the Repo Works Together

CueQ is structured as a schema-driven monorepo with clear layering:

- **Contracts first**: JSON schemas and shared Zod contracts define shape and constraints.
- **Pure domain core** (`packages/core`): rule logic for time, absence, workflow, roster, closing, audit.
- **Policy-as-code** (`packages/policy`): rule catalogs and rule-resolution behavior with test coverage.
- **Persistence boundary** (`packages/database`): Prisma client/schema and DB utility entry points.
- **API orchestration** (`apps/api`): NestJS adapters/controllers/services bridging HTTP/auth/persistence/core.
- **Web client** (`apps/web`): Next.js locale routes and shared request client/context.
- **Harness and CI scripts** (`scripts/`, `Makefile`): standardized local + CI validation entry points.

## Key Audit Findings and Remediations

### P1 — Blocking typecheck error in roster role authorization helper

**Finding:** TypeScript compilation failed in `apps/api/src/phase2/helpers/roster-shift.helper.ts` due to enum narrowing mismatch in inline `includes(user.role)` checks.

**Why it matters:** This blocked `make quick` at typecheck stage and prevented normal pre-commit validation flow.

**Remediation applied:**

- Replaced tuple-style role checks with explicit typed role sets:
  - `ROSTER_WRITE_ROLES`
  - `ROSTER_CROSS_OU_ROLES`
- Updated authorization predicates to use `Set.has(...)`.

**Result:** API typecheck now passes.

### P2 — Lint warning debt from unused symbols

**Finding:** Lint warnings existed in policy tests and leave-ledger implementation from unused imports/helpers.

**Why it matters:** Warning debt erodes signal quality in continuous validation and can hide newly introduced issues.

**Remediation applied:**

- Removed unused `PolicyEvalResult` type import from policy compliance tests.
- Removed unused rule imports from policy integration tests.
- Removed unused `monthOf` helper in leave-ledger and adjusted imports accordingly.

**Result:** Lint stage is now warning-clean for the touched files and global lint now passes cleanly in this pass.

### P2 — `test:unit` scope drift in `@cueq/database`

**Finding:** `packages/database` defined `test:unit` as `vitest run` (all tests), which included integration DB connectivity tests requiring PostgreSQL at `localhost:5433`.

**Why it matters:** This caused `make quick` to fail in environments without local DB, even though quick-check intent is fast/offline-leaning unit validation.

**Remediation applied:**

- Scoped `@cueq/database` `test:unit` script to non-integration suites only:
  - smoke
  - acceptance
  - compliance

**Result:** `make quick` now aligns better with expected quick-validation behavior and no longer hard-fails on missing DB for the database package's unit stage.

## Additional Refactor / Dedup / Optimization Opportunities (Backlog)

The following were identified as improvement opportunities but intentionally not expanded in this remediation slice to keep review scope controlled:

1. **Role policy centralization (API):** consolidate repeated role-check logic into typed policy helpers/constants shared across controllers/services.
2. **Service boundary hardening:** continue migration from broad phase services to narrower domain services with strict interface contracts.
3. **Validation profile split:** standardize `unit` vs `integration` script semantics across all packages to keep `make quick` deterministic.
4. **Audit artifact template:** add a structured audit-template in `docs/analysis/` with required sections for severity, root cause, remediation, and verification commands.

## Verification Snapshot (post-remediation)

Executed during this pass:

- `make quick` → pass
- `make docs-check` → pass

## Confidence and Limits

- **Confidence:** high for issues discovered through automated checks and directly remediated in this pass.
- **Limits:** this pass focused on repository-wide build/test harness reliability and static quality gates; it was not a full manual security audit of every runtime path.
