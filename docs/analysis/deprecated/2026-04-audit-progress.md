# Audit Progress

## Completed

### 1. [FIXED] Redundant Map construction in `selectSurchargeCategory` (`packages/core/src/core/time-engine/surcharge.ts`)

- Changed parameter to accept pre-built `configByCategory: ReadonlyMap`. Removed unused `SurchargeRule` import.

### 2. [FIXED] Stale unused import + duplicate preamble in `phase2.service.ts`

- Removed `PrismaService` import (unused post-decomposition). Extracted `requireHrActor()` private helper.

### 3. [FIXED] Static `metricAllowList` reconstructed per-call in `reporting.service.ts`

- Moved to module-level `METRIC_ALLOW_LIST` constant.

### 4. [FIXED] Duplicate booking-to-DTO mapping in `booking-domain.service.ts`

- Extracted `toBookingDto(booking)` private method.

### 5. [FIXED] Duplicate `toCoreClosingStatus` in closing files

- Made `closing-lock.helper.ts` export it; `closing-domain.service.ts` imports from helper.

### 6. [FIXED] Inverted guard clause + redundant optional chain in `catalog.ts`

- Reordered to early-return guard. Changed `?.push` to `!.push`.

### 7. [FIXED] Duplicate `appendAudit` private method in `workflow-runtime.service.ts`

- Injected `AuditHelper`, removed 33-line duplicate. Removed `HR_ADMIN_ROLES` alias.

### 8. [FIXED] Duplicate `appendAudit` + magic numbers in `hr-import.service.ts`

- Replaced private `appendAudit` with `AuditHelper` injection.
- Extracted `DEFAULT_WEEKLY_HOURS=39.83` and `DEFAULT_DAILY_TARGET_HOURS=7.97` constants.
- Fixed pre-existing `getRun` type annotation error (`Promise<unknown>`).

### 9. [FIXED] Duplicate `assertCanActForPerson` in `oncall-domain.service.ts`

- Private method was identical to exported function in `role-constants.ts`. Removed and imported shared version.

### 10. [FIXED] Duplicate `assignedPersonIdsForShift` in closing + roster services

- Created `helpers/roster-utils.ts` with the shared function. Both services now import from it.

### 11. [FIXED] Duplicate `appendAudit` in `terminal-gateway.service.ts`

- Injected `AuditHelper`; removed last remaining duplicate private `appendAudit` method.

### 12. [FIXED] Duplicate boolean expression in `absence-domain.service.ts::teamCalendar`

- `user.role === Role.TEAM_LEAD || HR_LIKE_ROLES.has(user.role)` was computed twice (as `includePending` and `maySeeReason`).
- Merged into single `isPrivilegedViewer` variable used for both status filtering and field redaction.

### 13. [FIXED] Redundant optional chain after explicit map set in `closing-domain.service.ts`

- `bookingsByPerson.get(booking.personId)?.push(...)` → `!.push(...)` (key was just ensured to exist above).

### 14. [FIXED] Duplicate destructure+reshape in `policy-query.service.ts`

- Identical 12-field destructuring+return in `policyBundle` and `policyHistory` extracted to module-level `toPolicyDto(entry)`.

### 15. [FIXED] Bare `catch` block in `audit/page.tsx`

- `catch { setError(t('requestFailed')); }` → `catch (cause) { setError(cause instanceof Error ? cause.message : t('requestFailed')); }` to match all other pages.

### 16. [FIXED] Double `query.toString()` call in `policy-admin/page.tsx`

- `query.toString() ? \`?${query.toString()}\` : ''`→ assigned to`qs` once, used twice.

All 16 fixes verified with `pnpm build`.

## Documentation Audit

### DOC-1. [FIXED] Empty Core Services table in `ARCHITECTURE.md`

- Section 4 had a table with headers but no rows (leftover placeholder).
- Filled with all 6 core services: Time Engine, Roster Service, Absence Service, Workflow Service, Closing Engine, Audit Service — matching the actual `packages/core/src/core/` layout.

### DOC-2. [FIXED] Mid-sentence bold emphasis across multiple docs

- Per style guide: bold is for headings and definition terms only.
- Removed or rewrote bold-emphasis phrases in:
  - `README.md` — tagline blockquote, "single, integrated system"
  - `docs/PRODUCT_SENSE.md` — "data-driven configuration", "easy/hard" pair
  - `docs/product-specs/privacy-reporting-guardrails.md` — "legally and politically toxic", "privacy guardrails built in from day one", "aggregated", "explicitly prohibited"
  - `docs/product-specs/policy-as-code.md` — "policy rules as first-class code artifacts"
  - `docs/product-specs/oncall-domain.md` — "dedicated subdomain"
  - `docs/product-specs/closing-console.md` — "first-class UI and API surface"
  - `docs/product-specs/api-first-integration.md` — "product surface"
  - `docs/design-docs/core-beliefs.md` — "data, not code", "generated from schemas", "manual fallback process"

### DOC-3. [FIXED] Duplicate PLANS.md reference in `AGENTS.md`

- References section listed `docs/PLANS.md` twice with slightly different descriptions. Removed the duplicate.

### DOC-4. [FIXED] `api-first-integration.md` docs location description

- Updated Swagger UI description to note it is served only in non-production environments (reflects SEC-2 fix).

### DOC-5. [REVIEWED — CLEAN] Inline code comments

- Core domain comments explain why (domain rules, legal requirements, workarounds). No obvious/redundant comments found.
- Audit, closing, workflow, roster comments all use the "why" style correctly.

### DOC-6. [FIXED] Mid-sentence bold in `docs/DESIGN.md`

- `packages/core/src/core/` contained `**zero imports from frameworks, databases, or HTTP libraries**` — bold on a constraint phrase, not a definition term.
- Removed bold; constraint is clear as plain text.

## Documentation Audit — Complete

All 56 markdown files reviewed and verified (`pnpm docs:links` passes). Coverage:

- Root docs: README.md, AGENTS.md, ARCHITECTURE.md
- docs/: DESIGN.md, PLANS.md, PRODUCT_SENSE.md, FRONTEND.md, SECURITY.md, RELIABILITY.md, QUALITY_SCORE.md, OPERATIONS_RUNBOOK.md, PILOT_READINESS_CHECKLIST.md
- docs/design-docs/: core-beliefs.md
- docs/design-decisions/: 001-tech-stack.md, 002-deployment-strategy.md, 003-monitoring-stack.md, index.md
- docs/exec-plans/: tech-debt-tracker.md, differentiators-traceability.md, active/000-template.md
- docs/exec-plans/completed/: 001 through 008, README.md
- docs/product-specs/: all 15 specs including index.md

## Final Review (Opus)

### FINAL-7. [FIXED] Swagger URL logged unconditionally in `main.ts`

- `console.log('📖 OpenAPI docs at ...')` printed even in production where Swagger is disabled (SEC-2 guard). In production, that URL returns 404 — the log was misleading. Moved the log inside the same `NODE_ENV !== 'production'` guard.

### FINAL-6. [FIXED] Missing `HUSKY: 0` in `backup-restore-weekly.yml`

- The weekly backup/restore CI workflow also runs `pnpm install` + `make setup`, triggering the `prepare` script. Without `HUSKY: 0`, husky would attempt to configure git hooks in CI. Added for consistency with `ci.yml`. The `codeql.yml` workflow doesn't install npm deps, so it doesn't need it.

### FINAL-5. [FIXED] Unexplained domain-specific constant in `hr-import.service.ts`

- `DEFAULT_WEEKLY_HOURS = 39.83` has no context for a new contributor. Added one-line comment: "TV-L full-time: 39 h 50 min/week (39.83 h), 7.97 h/day".

### FINAL-4. [FIXED] Verbose inline type in `toPolicyDto`

- `policy-query.service.ts` had a 12-line inline type annotation (`{ type: string; id: string; ... [key: string]: unknown }`) where importing `PolicyCatalogRule` from `@cueq/policy` is cleaner and preserves actual type information instead of widening to `unknown`.

### FINAL-3. [FIXED] Lockfile out of sync with package.json

- Loop 4 added `husky` to `devDependencies` in `package.json` but never ran `pnpm install`, so `pnpm-lock.yaml` didn't include husky. CI with `--frozen-lockfile` would have failed.
- Ran `pnpm install` to sync the lockfile. Husky `prepare` script ran successfully.

### FINAL-3b. [FIXED] CONTRIBUTING.md stock AI opening

- "Thank you for contributing to cueq" → direct statement of what cueq is and that you should read before opening a PR.

### FINAL-2. [FIXED] CHANGELOG.md was an AI placeholder

- Every "Commit Range" cell said "See git log" (tautology). Table duplicated docs/PLANS.md. "Unreleased" section said nothing.
- Rewrote to 3 honest lines: no releases yet, commits use conventional format, milestones are in PLANS.md.

### FINAL-1. [FIXED] Cosmetic artifacts from Loop 1 refactoring

- `closing-domain.service.ts`: removed double blank lines left behind where `toCoreClosingStatus` and `assignedPersonIdsForShift` were deleted; removed archaeology comment (`deduped from two call-sites`) that described the refactoring action rather than the code.
- `workflow-runtime.service.ts`: removed double blank line left behind where `HR_ADMIN_ROLES` alias was deleted.

## Security Audit

### SEC-1. [FIXED] Dependency vulnerabilities (10 → 1 moderate remaining)

- Added `pnpm.overrides` in root `package.json` to pin vulnerable transitive deps:
  - `multer >=2.1.1` (HIGH DoS via incomplete cleanup — production runtime via @nestjs/platform-express)
  - `file-type >=21.3.3` (MODERATE DoS via ASF loop + ZIP bomb — production runtime via @nestjs/common)
  - `serialize-javascript >=7.0.3` (HIGH RCE — build-time only, via @nestjs/cli)
  - `flatted >=3.4.0` (HIGH DoS — dev/lint only, via @typescript-eslint)
  - `ajv >=8.18.0` (MODERATE ReDoS — dev/build only, via @nestjs/cli)
- Upgraded `apps/web` Next.js from `^15.2.0` → `^15.5.13` (fixes HTTP request smuggling MODERATE)
- **DOCUMENTED, NOT FIXED:** Next.js disk cache growth (MODERATE) — requires major upgrade to 16.x; acceptable risk for internal university tool.
- Build verified: 6/6 tasks successful.

### SEC-2. [FIXED] Swagger UI served unconditionally in production (OWASP A05 — Security Misconfiguration)

- `SwaggerModule.setup` registers Express-level routes that bypass the NestJS `APP_GUARD`.
- `/api/docs` (UI) and `/api/docs-json` (full OpenAPI spec) were publicly accessible in production, leaking all endpoint paths, data models, and auth requirements.
- Fix: gated `SwaggerModule.setup` behind `process.env.NODE_ENV !== 'production'` in `apps/api/src/main.ts`.
- The CI schema-export script (`scripts/export-openapi.mjs`) calls `buildOpenApiDocument` directly — unaffected by the change.

### SEC-3. [REVIEWED — CLEAN] Authentication & Access Control (OWASP A01/A07)

- `AuthGuard` registered as `APP_GUARD` — applied globally to all routes.
- Protections beyond standard: max 4096-byte token, control-character rejection, multiple-header rejection.
- `@Public()` decorator used only on `/health` and `/hr/import-runs` (latter uses `x-integration-token`).
- `RolesGuard` registered as second `APP_GUARD`; domain services re-check roles at the service layer.
- `AuthService`: mock auth blocked in production unless `AUTH_ALLOW_INSECURE_MOCK=true`.
- OIDC adapter: `jwtVerify` with remote JWKS, issuer + audience validation. SAML: HS-family HMAC verification.

### SEC-4. [REVIEWED — CLEAN] Input Validation & Injection (OWASP A03)

- All API entry points validate with Zod schemas in `@cueq/shared`; `ZodExceptionFilter` returns 400 on failures.
- IDs validated as CUID; dates as strict ISO-8601; pagination capped at `max(100)`; notes bounded at `max(1000)`.
- No raw Prisma queries (`$queryRaw`, `$executeRaw`, `$queryRawUnsafe`) — zero SQL injection surface.
- CSV import: custom parser, 2 MB size cap via Zod, header duplicate/empty validation, no shell calls.

### SEC-5. [REVIEWED — CLEAN] SSRF (OWASP A10)

- `assertWebhookTargetUrl`: protocol allow-list (http/https only), credentials-in-URL rejection, private IP blocklist.
- `assertWebhookDispatchTargetUrl`: additionally DNS pre-resolves and checks against private IP ranges (blocks DNS rebinding).
- `fetch` uses `redirect: 'manual'` — prevents redirect-chain SSRF bypass. Timeout via `AbortSignal.timeout()`.

### SEC-6. [REVIEWED — CLEAN] Secrets Management & Gitignore

- `.gitignore` excludes `.env`, `.env.*`, `.env.production`, `*.pem`, `*.key`, `*.p12`, `credentials.json`, `service-account*.json`.
- No hardcoded secrets in production code. Only test files use dummy values.
- `docker-compose.yml` has dev-only local DB passwords — acceptable for local tooling.

### SEC-7. [REVIEWED — CLEAN] Frontend XSS / Security Headers

- No unsafe HTML injection API usage in `apps/web`. React escapes all rendered content by default.
- `next.config.ts` adds `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- NestJS API side uses `helmet()` for equivalent headers.

### SEC-8. [REVIEWED — CLEAN] CI Supply-Chain Security

- All GitHub Actions third-party steps pinned to commit SHAs (prevents tag-hijack attacks).
- `permissions: contents: read` (least privilege). `--frozen-lockfile` for reproducible builds.
- `dependency-review-action` fails on `high` severity in PRs.

### SEC-9. [REVIEWED — CLEAN] Logging / PII (OWASP A09)

- No PII in logs. Application-level logs contain only aggregate counts.
- No custom logger that could inadvertently capture request bodies or auth tokens.

## GitHub & CI Audit

### GH-1. [DONE] Created CONTRIBUTING.md

- No dedicated CONTRIBUTING.md existed (README had a Contributing section but not the file GitHub links to).
- Created minimal CONTRIBUTING.md at repo root that directs to AGENTS.md, includes quick checklist, links to issue templates and SECURITY.md vulnerability reporting.

### GH-2. [DONE] Created CHANGELOG.md

### GH-3. [DONE] Added pre-commit hooks (husky)

- No pre-commit hooks were configured. Local validation relied solely on CI.
- Added `husky` v9 to root `package.json` devDependencies with `"prepare": "husky"` script.
- Created `.husky/pre-commit` that runs `make quick` (lint + typecheck + unit tests, <10s target).
- Added `HUSKY: 0` to both CI job env blocks (`validate` and `fresh-clone-smoke`) to prevent husky from running during CI installs.
- No CHANGELOG or release convention documentation existed.
- Created CHANGELOG.md documenting the Conventional Commits convention, phase milestones (0-3), and reference to progress.md for post-Phase 3 fixes.

## Polish Pass (2026-03-25)

### FIX-17. Break threshold comparison changed from `>` to `>=` in `break-utils.ts`

- `requiredBreakMinutes` now uses `>=` (greater-than-or-equal) for threshold matching, so exactly 6h of work triggers the 30-minute break requirement and exactly 9h triggers 45 minutes.
- The field name `workedHoursMin` implies a minimum (inclusive), and all tests and the `evaluateTimeRules` engine expected this behavior.
- Affected files: `packages/core/src/core/break-utils.ts`

### FIX-18. `roundToTwo` floating-point fix in `utils.ts`

- Added `Number.EPSILON` offset before rounding to prevent IEEE 754 edge cases (e.g. `roundToTwo(1.005)` now correctly returns `1.01` instead of `1`).
- Affected files: `packages/core/src/core/utils.ts`

### FIX-19. `parseLocalTimeToMinute` returns 0 for invalid input instead of throwing

- Callers (surcharge window evaluation) expect a fallback value, not an exception, for malformed time strings.
- Affected files: `packages/core/src/core/time-engine/surcharge.ts`

### FIX-20. `isWithinWindow` treats `start === end` as full 24h window

- When the start and end minute are identical, every minute of the day falls within the window. Previously returned `false` for all minutes.
- Affected files: `packages/core/src/core/time-engine/surcharge.ts`

### FIX-21. Removed DST fall-back local-minute deduplication in `evaluateTimeRules`

- The `countedLocalMinutes` set skipped UTC minutes that mapped to the same local time during DST fall-back, under-counting actual hours worked. Work duration is defined by UTC elapsed time, not local clock representation.
- Affected files: `packages/core/src/core/time-engine/index.ts`

### FIX-22. `conflictFlags` type widened to include `'BOOKING_OVERLAP'` in `terminal-gateway.service.ts`

- The booking overlap detection pushed `type: 'BOOKING_OVERLAP'` into an array typed only for `'ABSENCE_CONFLICT'`, causing a TypeScript compilation error.
- Affected files: `apps/api/src/phase2/terminal-gateway.service.ts`

### LINT-1. Removed 14 unused imports across API and core packages

- Removed unused `afterEach` from `utils.test.ts`, `ClosingLockSource` from `closing-export.helper.ts`, `NotFoundException` from `workflow-assignment.helper.ts`, `ForbiddenException` from `absence-domain.service.ts` and `booking-domain.service.ts`, `NotFoundException` and `Role` from `webhook-domain.service.ts`, `ConflictException` from `terminal-gateway.service.ts`, `PrismaService` from `terminal-edge-cases.integration.test.ts`.
- Converted value imports to `import type` where only used as type annotations: `WorkflowType` in `workflow-delegation-crud.helper.ts`, `workflows-domain.service.ts`, `workflow-runtime.service.ts`; `AbsenceType` in `absence-domain.service.ts`.
- Replaced `import('@cueq/database').WorkflowPolicy` dynamic type import with proper `import type` in `workflow-utils.ts`.

## Pending Security Items (documented, not fixed)

- **MEDIUM — No Content-Security-Policy header** in `next.config.ts`. Includes legacy `X-XSS-Protection` but not a CSP directive. Low exploitability (React escapes by default, no raw HTML rendering), but CSP is best practice.
- **LOW — Rate limiting absent** from NestJS API. No `ThrottlerModule`. Acceptable for internal tool — OIDC/SAML tokens are externally issued (not local passwords), but excessive-request DoS is possible from authenticated users.
- **LOW — Health endpoint operational data** (`/health`, `@Public()`) exposes terminal counts, HR import status, backup timestamps without auth. Intentional for monitoring but leaks operational state to unauthenticated callers.
