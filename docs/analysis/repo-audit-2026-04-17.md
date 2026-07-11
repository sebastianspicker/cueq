# Repo Audit - 2026-04-17

## Scope

This audit covers the full repository after a fresh familiarization pass across:

- `apps/api`
- `apps/web`
- `packages/core`
- `packages/database`
- `packages/shared`
- `packages/policy`
- `schemas`
- `contracts`
- `fixtures`
- `scripts`
- `docs`

Legacy audit artifacts were moved out of the repo root into `docs/analysis/deprecated/`:

- `docs/analysis/deprecated/2026-04-07-repo-audit.md`
- `docs/analysis/deprecated/2026-04-audit-progress.md`

## Repository Categories

- `apps/api`: NestJS transport, auth, orchestration, integrations, reporting, and operational workflows.
- `apps/web`: Next.js frontend, locale shell, operator pages, API client state, acceptance/a11y coverage.
- `packages/core`: pure domain logic for time engine, absence, workflow, roster, closing, and audit.
- `packages/database`: Prisma schema, migrations, seeds, and database-facing verification.
- `packages/shared`: Zod runtime contracts shared across frontend and backend.
- `packages/policy`: policy-as-code catalogs and rule definitions.
- `schemas`: JSON Schema source-of-truth artifacts and generated-type inputs.
- `contracts`: committed OpenAPI snapshot.
- `fixtures`: synthetic and derived reference fixtures plus integration datasets.
- `scripts`: generation, verification, import, and backup/restore tooling.
- `docs`: architecture, specs, plans, reliability, security, and analysis artifacts.

## Verification Snapshot

- `pnpm typecheck`: FAIL
  - `apps/api/src/phase2/helpers/roster-shift.helper.ts:26`
  - `apps/api/src/phase2/helpers/roster-shift.helper.ts:29`
- `pnpm test:unit`: FAIL
  - `packages/database/src/__tests__/database.integration.test.ts:11`
  - `packages/core/src/core/time-engine/__tests__/flextime.test.ts`
  - `packages/core/src/core/__tests__/fixture-parity.test.ts`
  - `packages/core/src/core/closing/__tests__/closing.test.ts`
  - `packages/core/src/core/time-engine/__tests__/surcharge.test.ts`
- `pnpm lint`: PASS with warnings
- `pnpm docs:links`: PASS
- `docker compose config --quiet`: PASS

## Top Findings

- High: team leads can read `closing-completion` report data outside their own organization unit because the controller allows `TEAM_LEAD` but the implementation never scopes by OU.
  - `apps/api/src/phase2/controllers/reports.controller.ts:61-72`
  - `apps/api/src/phase2/helpers/reporting-analytics.helper.ts:169-208`
- High: post-close correction bookings bypass normal overlap protection and can create overlapping entries inside locked/exported periods.
  - `apps/api/src/phase2/helpers/closing-correction.helper.ts:195-204`
  - `apps/api/src/phase2/services/booking-domain.service.ts:80-90`
- Critical: flextime break semantics are internally inconsistent and currently break fixture parity and unit tests.
  - `packages/core/src/core/time-engine/flextime.ts:59-70`
  - `packages/core/src/core/time-engine/__tests__/flextime.test.ts`
  - `packages/core/src/core/__tests__/fixture-parity.test.ts`
  - `fixtures/reference-calculations/flextime.json`
- High: the database unit-test lane still executes a live Postgres integration test.
  - `packages/database/package.json:13-17`
  - `packages/database/vitest.config.ts:3-10`
  - `packages/database/src/__tests__/database.integration.test.ts`
- High: frontend privileged data can remain visible after auth/role changes because failed reloads set errors but do not clear prior restricted state.
  - `apps/web/src/app/[locale]/reports/page.tsx`
  - `apps/web/src/app/[locale]/policy-admin/page.tsx`
- Critical: migrations are not a reliable fresh-environment path, and at least one migrated column shape drifts from `schema.prisma`.
  - `packages/database/prisma/migrations/20260228100000_fr400_absence_leave/migration.sql`
  - `packages/database/prisma/migrations/20260228224000_fr600_monthly_closing/migration.sql`
  - `packages/database/prisma/schema.prisma`
- High: shared contracts and canonical schemas drift on absence date shape and identifier strictness.
  - `schemas/domain/absence.schema.json:28-33`
  - `packages/shared/src/schemas/absence.ts:40-50`
  - `packages/shared/src/schemas/common.ts`
  - `schemas/domain/_defs/common.schema.json`

## Category Audit

### API Backend

- High: `closing-completion` report lacks OU scoping for `TEAM_LEAD`.
- High: post-close correction flow creates bookings directly without overlap checks.
- High: auth decisions rely on token role claims without reconciling them against persisted person role/OU state.
- High: overlap queries miss open-ended bookings where `endTime` is `null`.
- Medium: webhook secrets are stored but not used for signing or authenticated delivery.
- Medium: public health endpoint exposes more operational detail than a liveness endpoint should.
- Medium: roster-write authorization is duplicated and currently inconsistent between controller decorators and service logic.
- Improvement: centralize authorization policy definitions and add focused negative tests for cross-OU access, stale-role access, and correction overlap paths.

### Core Domain

- Critical: flextime omitted-break behavior conflicts with tests and fixtures.
- High: daily limits are enforced per booking rather than per day aggregate, so split bookings can evade daily max-hour and break rules.
- High: `evaluateTimeRules` double-counts overlapping work intervals instead of rejecting or normalizing them.
- High: `calculateProratedMonthlyTarget` ignores the requested month boundary and can overcount segments.
- Medium: export checksum generation depends on object key insertion order, weakening reproducibility claims.
- Medium: roster plan-vs-actual coverage treats any overlap as full coverage.
- Low: closing and surcharge tests currently disagree with implemented semantics, which keeps the unit lane red.
- Improvement: add explicit spec tests for ambiguous semantics and tighten violation-context typing.

### Frontend

- High: restricted report or policy data is not cleared after a 403 on token/role change.
- High: API base handling is effectively hardcoded to `http://localhost:3001`, which bypasses the configured Next rewrite and makes non-local deployment brittle.
- High: audit page likely targets the wrong endpoint shape and currently lacks route-level coverage.
- Medium: locale behavior is inconsistent.
  - `html lang` is always `de`
  - root redirects always land on `/de/dashboard`
  - locale switch jumps users back to dashboard instead of preserving route
- Medium: settings persistence is placebo today because stored preferences are never read back and applied.
- Medium: multiple pages can show stale results after failed requests because old state is not cleared before or after a failing fetch.
- Improvement: move to a token-aware query/cache layer and add negative-state Playwright coverage for auth changes, stale data, locale correctness, and the audit/settings routes.

### Database And Tooling

- Critical: committed migrations are not sufficient for clean bootstrap and diverge from `schema.prisma` in at least one column definition.
- High: `make check` / `scripts/check.sh` do not exercise the full lane set implied by the repo docs and package scripts.
- High: API integration tests are not safely schema-isolated in the same way as acceptance/compliance suites.
- High: backup/restore verification omits workflow policy and delegation tables, so it can report success while missing operational configuration.
- Medium: backup/restore verification is a logical data replay, not a real backup/restore test of indexes, grants, sequences, or migration history.
- Medium: HR import is non-atomic and silently coerces unknown roles to `EMPLOYEE`.
- Medium: fixture validation ignores CSV integration fixtures used by import paths.
- Improvement: add a clean-DB `prisma migrate deploy` CI lane, isolate integration test schemas, and validate integration fixture formats explicitly.

### Shared Contracts, Policy, Schemas, Docs

- High: absence contracts drift between JSON Schema and Zod.
  - JSON Schema models `startDate`/`endDate` as datetime.
  - shared runtime contract models them as date-only.
- High: docs advertise event types and event envelopes that do not match the shared event schema.
- High: canonical JSON Schema ID rules are weaker than shared Zod ID validation, so schema-valid payloads can still fail runtime parsing.
- Medium: multiple entity JSON Schemas under-specify fields that shared read models treat as required.
- Medium: workflow decision schemas allow contradictory `action` and legacy `decision` inputs in the same payload.
- Medium: several request/query schemas still miss chronological validation or effective-change validation.
- Medium: break-rule schema allows an empty threshold list, which can disable break enforcement entirely while remaining schema-valid.
- Medium: policy docs lag the actual catalog surface, including `SURCHARGE_RULE` coverage.
- Improvement: reduce duplicate contract sources, tighten discriminated unions, and make the docs reference the actual runtime contract surface.

## Category Strengths

- `apps/api`: auth header parsing and webhook-target SSRF guardrails are stronger than average.
- `packages/core`: workflow and audit modules are comparatively well tested and structurally clean.
- `apps/web`: reusable layout and API-client structure already exist, so hardening can stay incremental.
- `packages/database`: Prisma schema is explicit and readable; OpenAPI drift checking already exists.
- `packages/policy`: policy tests are the strongest contract-level suite in the repo.
- `docs`: architecture and product specs are detailed enough to make drift visible instead of hidden.

## Recommended Order

- 1. Restore green verification: fix `roster-shift.helper` typing, separate database unit vs integration tests, and reconcile core flextime/closing/surcharge test semantics.
- 2. Close privacy/correctness bugs: OU scope `closing-completion`, clear stale privileged frontend state, and add overlap checks to closing corrections.
- 3. Repair infrastructure truthfulness: fix migration history, strengthen backup/restore coverage, and align `check` with the documented verification contract.
- 4. Reconcile contract drift: absence date shapes, event envelopes, ID rules, and workflow decision inputs.
