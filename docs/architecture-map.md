# Architecture and Flow Map

Status: source-backed architecture map for the current repository. This document
uses code, tests, config, and existing docs only. When behavior is not clear from
those sources, it is marked `UNCLEAR`.

## Runtime Structure

cueq is a pnpm/Turborepo monorepo for time tracking, absence management, roster
planning, workflows, monthly closing, reporting, and integrations.

Main runtime packages:

- `apps/api`: NestJS HTTP API. Runtime entrypoint is `apps/api/src/main.ts`.
- `apps/web`: Next.js web UI. Runtime entrypoints are `apps/web/src/app/layout.tsx`,
  `apps/web/src/app/page.tsx`, `apps/web/src/app/[locale]/layout.tsx`, and
  localized pages under `apps/web/src/app/[locale]`.
- `packages/database`: Prisma schema, migrations, generated client export, and
  seed/reset scripts. Storage entrypoint is `packages/database/prisma/schema.prisma`.
- `packages/shared`: Zod schemas and generated schema-derived TypeScript types
  shared by API, UI, and core.
- `packages/core`: pure domain rules and state machines.
- `packages/policy`: policy rule defaults, effective-date catalog, and golden tests.

Primary dependency direction:

```text
apps/web -> @cueq/shared
apps/api -> @cueq/shared + @cueq/core + @cueq/policy + @cueq/database
@cueq/core -> @cueq/shared + @cueq/policy
@cueq/policy -> shared date helpers / Zod
@cueq/database -> Prisma/PostgreSQL
```

Do not invert this boundary without an explicit architecture decision. Core
domain code should remain free of NestJS, Prisma, HTTP, and filesystem concerns.

## Main Runtime Entry Points

| Entry point                            | Starts                                     | Runtime role                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/main.ts`                 | `pnpm --filter @cueq/api start` / Nest CLI | Creates the Nest app, enables Helmet and CORS, installs Prisma/Zod exception filters, exposes Swagger/OpenAPI outside production, and listens on `PORT` or `3001`. |
| `apps/api/src/app.module.ts`           | Nest module bootstrap                      | Wires Prisma, auth, schedule jobs, health, and `Phase2Module`.                                                                                                     |
| `apps/api/src/phase2/phase2.module.ts` | Imported by `AppModule`                    | Consolidates operational controllers/services for bookings, absences, workflows, rosters, closing, terminal import, HR import, reports, policies, and webhooks.    |
| `apps/web/src/app/layout.tsx`          | Next.js app router                         | Root HTML shell and global CSS.                                                                                                                                    |
| `apps/web/src/app/[locale]/layout.tsx` | Localized Next.js route tree               | App navigation, providers, locale handling, and client-side API context.                                                                                           |
| `apps/web/src/app/[locale]/*/page.tsx` | User browser navigation                    | Feature pages for dashboard, bookings, leave, calendar, approvals, roster, closing, reports, audit, settings, on-call, policy admin, and time-engine evaluation.   |
| `scripts/*.sh` / `scripts/*.mjs`       | Makefile and package scripts               | Verification, generation, OpenAPI export/check, schema validation, backup/restore, HR import CLI, and demo screenshot harnesses.                                   |
| `@nestjs/schedule` jobs                | Nest scheduler                             | Hourly workflow escalation and closing cutoff checks.                                                                                                              |

## Contracts That Must Not Break

- HTTP API routes and response shapes under `/v1/*`, plus `/health` and
  `/health/ready`.
- Committed OpenAPI snapshot: `contracts/openapi/openapi.json`.
- JSON Schemas under `schemas/domain` and `schemas/fixtures`.
- Shared Zod schemas under `packages/shared/src/schemas`.
- Prisma schema and migrations under `packages/database/prisma`.
- Public package barrels: `packages/core/src/index.ts`, `packages/policy/src/index.ts`,
  `packages/shared/src/index.ts`, `packages/database/src/index.ts`.
- Audit trail append-only behavior. Code should append `AuditEntry` records,
  not update/delete existing ones.
- Closing status translation: the core/shared public status `APPROVED` maps to
  the database persistence status `CLOSED`.
- Roster assignment compatibility: `Shift.personId` is marked deprecated but
  still coexists with `ShiftAssignment`.
- Auth selector compatibility: preferred `AUTH_PROVIDER=mock|oidc|saml`, with
  legacy `AUTH_MODE` fallback still present.
- Honeywell terminal CSV protocol: `HONEYWELL_CSV_V1`.
- Event outbox/webhook envelope shape with `eventId`, `eventType`, `timestamp`,
  `version`, `source`, `aggregateType`, `aggregateId`, and `payload`.

## Important Domain Primitives

| Domain         | Primitives                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Identity/org   | `Person`, `OrganizationUnit`, `Role`, supervisor relation, work-time model assignment.                                        |
| Time tracking  | `Booking`, `BookingSource`, `TimeType`, `TimeTypeCategory`, `TimeAccount`.                                                    |
| Absence/leave  | `Absence`, `AbsenceType`, `AbsenceStatus`, `LeaveAdjustment`, leave ledger and working-day calculations.                      |
| Roster         | `Roster`, `RosterStatus`, `Shift`, `ShiftAssignment`, min staffing, plan-vs-actual.                                           |
| Workflow       | `WorkflowInstance`, `WorkflowType`, `WorkflowStatus`, `WorkflowPolicy`, `WorkflowDelegationRule`.                             |
| Closing/export | `ClosingPeriod`, `ClosingStatus`, `ClosingLockSource`, `ExportRun`, payroll CSV/XML artifact concepts.                        |
| Integrations   | `TerminalDevice`, terminal heartbeats/sync batches, `HrImportRun`, `DomainEventOutbox`, `WebhookEndpoint`, `WebhookDelivery`. |
| Audit          | `AuditEntry` and domain audit draft/building helpers.                                                                         |
| Policy         | break/rest/max-hours/leave/surcharge rules and effective-date policy catalog.                                                 |

## Storage and Filesystem Interactions

- PostgreSQL is the primary database via Prisma. Local default is
  `postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public`.
- Prisma migrations are forward storage contracts. Current migration files
  include baseline schema, approval inbox indexes, workflow policy versioning,
  and time threshold policy.
- Seed/reset scripts under `packages/database/prisma/*.mjs` create deterministic
  local/test/demo data.
- `ExportRun.artifact` stores export payload content in the database, not a file
  path, based on the Prisma model.
- Backup/restore verification uses scripts and Docker/Postgres tooling.
- Fixtures under `fixtures/` and schemas under `schemas/` are verification and
  contract inputs.
- `docs/generated/*` is generated documentation and should be regenerated, not
  hand-edited.

## External APIs and Third-Party Dependencies

- NestJS, `@nestjs/swagger`, `@nestjs/schedule`, Helmet, and Express platform for
  the API.
- Prisma and PostgreSQL for persistence.
- `jose` for OIDC/SAML-like JWT verification.
- Next.js, React, and `next-intl` for the web app.
- Playwright and Vitest for browser and test execution.
- Zod for runtime validation.
- Docker Compose services: Postgres, optional Keycloak, optional Prometheus,
  Alertmanager, and Grafana.
- External integration contracts in code/docs: OIDC/SAML IdM, HR master-data
  provider, Honeywell CSV terminal gateway, payroll export consumers, webhook
  receivers. Some are implemented as local adapters/stubs; production readiness
  is `UNCLEAR` without deployment evidence.

## Configuration Sources

- `.env.example`: documents runtime environment variables.
- API: `PORT`, `NODE_ENV`, `DATABASE_URL`, `CORS_ORIGINS`,
  `CORS_ALLOW_CREDENTIALS`, `AUTH_PROVIDER`, legacy `AUTH_MODE`,
  `AUTH_ALLOW_INSECURE_MOCK`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`,
  `SAML_ISSUER`, `SAML_AUDIENCE`, `SAML_JWT_SECRET`,
  `TERMINAL_GATEWAY_TOKEN`, `HR_IMPORT_TOKEN`, `HR_PROVIDER_MODE`,
  `HR_MASTER_API_URL`, `HR_MASTER_API_TOKEN`, `HR_MASTER_API_TIMEOUT_MS`,
  closing cutoff variables, reporting minimum group size, and webhook dispatch
  variables.
- Web: Next.js config rewrites `/api/:path*` to `http://localhost:3001/:path*`;
  runtime UI API base URL is also stored in browser session storage by
  `ApiProvider`.
- Test harnesses override `DATABASE_URL` with schema-specific URLs for unit,
  integration, acceptance, compliance, and web acceptance runs.

## Error-Handling Strategy

- API guards reject missing, malformed, oversized, or invalid bearer tokens with
  `UnauthorizedException`.
- Role checks use `ForbiddenException`.
- Zod validation errors are converted to structured bad-request responses by
  `ZodExceptionFilter` or explicit `BadRequestException` handling.
- Prisma known errors are mapped by `PrismaExceptionFilter`.
- Domain state machines in `@cueq/core` usually return violations instead of
  throwing; API adapters translate invalid transitions to HTTP errors.
- Web UI wraps fetch failures in `ApiRequestError` and page-local error state.
- Integration jobs often record partial outcomes in database run/batch records.
  HR import catches transaction errors and records a failed import run.
- Webhook dispatch records delivery failures, truncates stored error text, and
  schedules exponential retry until max attempts.

## State Transitions

| State machine   | Valid states/transitions in code                                                                                                                  | Notes                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Workflow        | `DRAFT -> SUBMITTED -> PENDING -> APPROVED/REJECTED`; `PENDING -> ESCALATED`; `DELEGATE` keeps status; `CANCEL` from non-final states.            | Runtime also normalizes legacy `decision=APPROVED/REJECTED` to new `action=APPROVE/REJECT`.                          |
| Closing         | Core: `OPEN -> REVIEW -> APPROVED -> EXPORTED`; `REOPEN` from `REVIEW`/`APPROVED` to `OPEN`; `POST_CLOSE_CORRECTION` from `EXPORTED` to `REVIEW`. | Persistence maps core `APPROVED` to DB `CLOSED`.                                                                     |
| Roster          | DB states `DRAFT`, `PUBLISHED`, `CLOSED`; publishing requires draft status and no staffing shortfalls.                                            | `CLOSED` handling is present in schema but not fully mapped from inspected flow; mark deeper lifecycle as `UNCLEAR`. |
| Absence         | DB states `REQUESTED`, `APPROVED`, `REJECTED`, `CANCELLED`; some absence types auto-approve, others create workflows.                             | Workflow side effects update related absence status; exact complete side-effect matrix needs deeper inspection.      |
| Event outbox    | `PENDING`, `FAILED`, `DELIVERED`; dispatch processes pending/failed events below max attempts.                                                    | Events with no subscribed endpoints are marked delivered with `skipped` count.                                       |
| Terminal import | Batch creates bookings, counts duplicates, records conflict flags, creates `TerminalSyncBatch`.                                                   | Malformed CSV rows are counted and skipped; unknown time types are skipped without a per-row error in the result.    |
| HR import       | Run status `SUCCEEDED` or `FAILED`; validates all rows before transaction; creates/updates people, OUs, work models, supervisors.                 | Some transaction errors are surfaced only in run summary, not thrown to HTTP caller.                                 |

## Major Flow Maps

### 1. Authenticated API Request

- Starts when a browser, test, or integration calls a protected Nest endpoint.
- Inputs trusted/untrusted: HTTP headers and bearer token are untrusted. Public
  route metadata is trusted code.
- Validation: `AuthGuard` enforces exactly one bearer token, max token length,
  no control characters, provider verification, and person resolution. `RolesGuard`
  checks route role metadata where present.
- State read: IdP/mock token claims, `Person` row by external identity/email.
- State written: request-local `user` object only.
- Can fail: missing/malformed token, provider failure, unresolved person, role
  mismatch, bad auth config.
- Failure surfaced: HTTP 401/403 or bootstrap error for unsupported auth config.
- Tests protecting it: auth service, mock/OIDC/SAML integration tests, guards,
  role mapping tests, API integration/acceptance tests.
- Wrong-result risk: a route without proper role metadata can still run if the
  service layer does not enforce authorization. Mock auth is allowed outside
  production and can hide IdP mapping issues.

### 2. Web UI Request to API

- Starts when a localized Next.js page calls `useApiQuery` or `createApiRequest`.
- Inputs trusted/untrusted: browser session storage API base URL/token and form
  values are untrusted.
- Validation: UI performs local form constraints inconsistently by page; server
  schemas remain the real validation boundary.
- State read: browser session storage, API responses, localized message files.
- State written: browser session storage, page-local React state, API-side state
  through HTTP calls.
- Can fail: invalid API base URL, missing token, network/API error, stale UI
  contract, rejected server validation.
- Failure surfaced: `ApiRequestError`, page-local status banners/error states, or
  React error boundary.
- Tests protecting it: web unit/component tests, API client tests, web acceptance
  tests, a11y route tests.
- Wrong-result risk: pages duplicate API contract/state assumptions locally;
  browser acceptance tests are currently blocked without Playwright Chromium per
  the verification baseline.

### 3. Booking Creation

- Starts at `POST /v1/bookings` or equivalent UI action.
- Inputs trusted/untrusted: JSON payload is untrusted; authenticated actor is
  trusted only after guard/person resolution.
- Validation: `CreateBookingSchema`, `assertCanActForPerson`, target person
  lookup, source restrictions, closing lock check, overlap check.
- State read: actor `Person`, target `Person`, closing periods, existing
  bookings, `TimeType`.
- State written: `Booking`, `AuditEntry`, `DomainEventOutbox`.
- Can fail: invalid schema, unauthorized actor, reserved source, missing person,
  locked closing period, booking overlap, DB errors.
- Failure surfaced: 400/403/404/409 or Prisma-mapped HTTP errors.
- Tests protecting it: API acceptance, Phase 3 integration, booking overlap unit,
  closing lock and edge-case integration tests.
- Wrong-result risk: inverted start/end inputs are normalized only for lock and
  overlap range calculation; the persisted start/end are still the parsed values.
  Whether this is intentional is `UNCLEAR`.

### 4. Absence and Leave

- Starts at absence, leave balance, calendar, or leave adjustment endpoints.
- Inputs trusted/untrusted: JSON/query inputs are untrusted; absence reasons are
  sensitive.
- Validation: shared absence/leave schemas, actor/person access checks, closing
  lock checks, holiday-aware working-day calculation, overlap checks, HR-like
  role checks for leave adjustments.
- State read: person, org unit, holidays fixture/provider, absences, leave
  adjustments, workflows, closing periods.
- State written: `Absence`, `WorkflowInstance` for approval-required absences,
  `LeaveAdjustment`, `AuditEntry`.
- Can fail: no working days, overlap, missing person, locked period, forbidden
  access, invalid dates, workflow assignment failure.
- Failure surfaced: HTTP exceptions or workflow errors.
- Tests protecting it: core absence tests, API acceptance/compliance, GDPR edge
  tests, leave balance tests.
- Wrong-result risk: absence reason visibility depends on both service filtering
  and UI display. Calendar/reporting privacy must be preserved across changes.

### 5. Workflow Approval

- Starts from workflow creation helpers, approval UI, or `POST /v1/workflows/:id/decision`.
- Inputs trusted/untrusted: decision/action, reason, delegation target, and
  workflow ID are untrusted.
- Validation: shared workflow schemas in controllers/helpers, actor visibility,
  available action computation, role/type compatibility, delegation validation,
  core workflow transition check, post-close self-approval guard.
- State read: workflow instance, workflow policy, delegation rules, people,
  related entity state.
- State written: `WorkflowInstance`, delegation trail, `AuditEntry`, and related
  side effects through `WorkflowSideEffectsHelper`.
- Can fail: workflow not found, forbidden action, invalid transition, invalid
  delegate, stale status update, side-effect validation failure.
- Failure surfaced: 400/403/404; transition violations are included in bad
  request details.
- Tests protecting it: core workflow tests, workflow helper tests, API
  acceptance/integration tests.
- Wrong-result risk: legacy `decision` compatibility and new `action` commands
  coexist. A caller can receive a successful workflow update while related entity
  side effects are wrong if helper logic drifts; side-effect matrix needs deeper
  audit before workflow refactors.

### 6. Roster Planning

- Starts at `/v1/rosters` endpoints or roster UI.
- Inputs trusted/untrusted: roster periods, shifts, assignments, and publish
  actions are untrusted.
- Validation: shared roster schemas, write/read role checks, organization unit
  checks, closing lock checks, overlapping roster detection, shift interval
  checks, draft-only editing, min staffing before publish.
- State read: actor person/org unit, rosters, shifts, assignments, bookings,
  closing periods.
- State written: `Roster`, `Shift`, `ShiftAssignment`, `AuditEntry`.
- Can fail: forbidden org access, overlapping roster, non-draft edit, missing
  shift/person, staffing shortfall, locked period, DB constraints.
- Failure surfaced: 400/403/404 or Prisma-mapped errors.
- Tests protecting it: core roster tests, roster helper tests, API acceptance,
  web acceptance.
- Wrong-result risk: deprecated `Shift.personId` and current `ShiftAssignment`
  must stay synchronized for compatibility until the old path is proven unused.
  Plan-vs-actual calculations can run without crashing but be wrong if assignment
  compatibility is mishandled.

### 7. On-Call Rotations and Deployments

- Starts at `/v1/oncall/*` endpoints or on-call UI.
- Inputs trusted/untrusted: rotation/deployment payloads and query filters are
  untrusted.
- Validation: shared on-call schemas, approval-capable role checks, org-unit
  restrictions for team leads/planners, `assertCanActForPerson`, rotation
  existence, date range checks, booking overlap checks for deployment bookings.
- State read: person, rotation, deployment, booking, time type, org unit.
- State written: `OnCallRotation`, `OnCallDeployment`, sometimes `Booking`,
  `AuditEntry`.
- Can fail: unauthorized role, missing rotation/person, bad date range,
  overlapping booking, missing time type, DB errors.
- Failure surfaced: HTTP exceptions.
- Tests protecting it: core on-call rest tests, API integration/acceptance, web
  acceptance.
- Wrong-result risk: rest compliance depends on local time/date semantics and
  policy defaults. Deployment-to-booking coupling needs care because payroll
  relevance is implied by booking creation.

### 8. Monthly Closing and Payroll Export

- Starts from closing UI/API endpoints or hourly `ClosingCutoffService`.
- Inputs trusted/untrusted: month/org filters, review/approve/export/reopen and
  correction payloads are untrusted.
- Validation: role checks, closing config readers, `parseMonthToRange`, closing
  checklist generation, core cutoff transition state machine, export role checks,
  correction and lock checks.
- State read: closing periods, bookings, absences, workflows, rosters, balances,
  export runs, org units.
- State written: `ClosingPeriod`, `ExportRun`, correction `Booking`, workflow
  records, `AuditEntry`, outbox events.
- Can fail: invalid transition, checklist errors, forbidden role, locked period,
  missing period/run, self-approval guard, export generation errors.
- Failure surfaced: HTTP exceptions; scheduled job logs failures.
- Tests protecting it: core closing tests, closing helper tests, API acceptance,
  backup/restore acceptance, integration edge-case tests.
- Wrong-result risk: core/shared `APPROVED` maps to database `CLOSED`. Breaking
  this translation can make UI/API state look valid while stored state is wrong.
  Backup/restore baseline recently verified an empty public schema only, so it
  is weak evidence for non-empty export/closing data.

### 9. Terminal Import and Heartbeat

- Starts at `/v1/terminal/sync/batches`, `/v1/terminal/sync/batches/file`, or
  `/v1/terminal/heartbeats`.
- Inputs trusted/untrusted: integration token, terminal ID, CSV, record payload,
  heartbeat details are untrusted.
- Validation: integration token for heartbeat; batch/file schemas; Honeywell CSV
  parsing; required headers; per-row Zod validation; dedupe; known time type;
  absence conflict; booking overlap.
- State read: terminal devices, time types, absences, bookings.
- State written: `TerminalDevice`, `Booking`, `TerminalSyncBatch`,
  `TerminalHeartbeat`, `AuditEntry`.
- Can fail: bad token, invalid CSV, missing batch, malformed payload, DB error.
- Failure surfaced: HTTP exceptions for invalid top-level payload/header/batch;
  row-level malformed records and conflicts are reported in result payload.
- Tests protecting it: CSV parser tests, terminal edge-case integration tests,
  Phase 3 integration tests.
- Wrong-result risk: unknown `timeTypeCode` rows are skipped without a distinct
  result category in inspected code. Malformed CSV rows are counted, not stored
  individually.

### 10. HR Master Import

- Starts at `/v1/hr/import-runs` or `scripts/hr-import.mjs`.
- Inputs trusted/untrusted: integration token, source mode, CSV or external HR
  provider payload are untrusted.
- Validation: integration token, import payload schema, CSV parser, required
  fields, duplicate external IDs/emails, numeric hours, role mapping, supervisor
  resolution.
- State read: existing people, org units, work-time models, supervisor records,
  optional HR provider.
- State written: `HrImportRun`, `OrganizationUnit`, `WorkTimeModel`, `Person`,
  supervisor relation, `AuditEntry`.
- Can fail: bad token, invalid CSV, invalid role/hours, duplicate row,
  missing supervisor, provider failure, DB transaction error.
- Failure surfaced: validation errors are recorded in failed `HrImportRun`;
  top-level CSV parse/token errors throw HTTP errors.
- Tests protecting it: HR provider integration tests, Phase 3 integration tests,
  fixture/schema validation.
- Wrong-result risk: work-time models are derived from names into IDs and default
  to `FLEXTIME` with fixed effective date `2026-01-01`. Whether that is a durable
  production contract or pilot simplification is `UNCLEAR`.

### 11. Reports, Audit, and Privacy Views

- Starts at report/audit/calendar endpoints and UI pages.
- Inputs trusted/untrusted: report filters, date ranges, person/org filters,
  pagination are untrusted.
- Validation: report query schemas and role constants; some controllers parse
  query values directly.
- State read: bookings, absences, closing periods, audit entries, workflow and
  roster state.
- State written: report access can append audit entries for sensitive report
  access.
- Can fail: forbidden role, invalid query, missing person/org state.
- Failure surfaced: HTTP exceptions and UI error state.
- Tests protecting it: GDPR compliance tests, report/audit integration tests,
  web acceptance/a11y tests.
- Wrong-result risk: privacy guardrails depend on role sets, filtering, and UI
  wording. Aggregation threshold config is documented, but exact enforcement
  coverage needs deeper report-by-report inspection.

### 12. Webhook Dispatch

- Starts at `/v1/integrations/webhooks/dispatch`; no automatic cron was found in
  inspected source.
- Inputs trusted/untrusted: endpoint configuration, outbox payloads, and remote
  HTTP responses are untrusted.
- Validation: HR/Admin role; endpoint URL validation on create and dispatch;
  private target blocking unless explicitly allowed; bounded response body read;
  timeout; max attempts.
- State read: active webhook endpoints, pending/failed outbox events.
- State written: `WebhookEndpoint`, `WebhookDelivery`, `DomainEventOutbox`,
  `AuditEntry`.
- Can fail: forbidden role, invalid URL, DNS/private target check, remote HTTP
  non-2xx, timeout, fetch error, DB write failure.
- Failure surfaced: delivery records and outbox status/errors; dispatch command
  returns processed/delivered/failed/skipped counts.
- Tests protecting it: webhook URL/body unit tests, Phase 3 integration tests.
- Wrong-result risk: events with no subscribers are marked `DELIVERED` and
  counted as skipped. That is code-backed behavior, but it may be surprising to
  operators unless UI/docs preserve the distinction.

### 13. OpenAPI and Generated Contracts

- Starts at `make generate`, `make openapi-check`, or API build scripts.
- Inputs trusted/untrusted: controller decorators, DTOs, app module wiring, and
  generated output are source-controlled but can drift.
- Validation: `scripts/openapi-check.sh` compares generated OpenAPI to committed
  snapshot.
- State read: compiled API app, OpenAPI builder, existing snapshot.
- State written: generated OpenAPI snapshot and generated docs when running
  generation.
- Can fail: app boot failure, snapshot drift, missing compiled artifacts.
- Failure surfaced: script exit code and diff message.
- Tests protecting it: OpenAPI contract integration test and `make openapi-check`.
- Wrong-result risk: DTO classes, shared Zod schemas, and controller behavior can
  diverge. Passing OpenAPI drift only proves snapshot consistency with decorators,
  not full runtime validation parity.

## Compatibility and Deprecation Layers

- `AUTH_MODE` remains a fallback for `AUTH_PROVIDER`; `.env.example` labels it
  backward-compatible and deprecated.
- `Shift.personId` is a deprecated compatibility field beside
  `ShiftAssignment`.
- Closing public status `APPROVED` is stored as DB `CLOSED`.
- Workflow decision command accepts legacy `decision` and current `action`.
- `phase2/` is a historical module name retained by ADR-004 until a planned
  rename is approved.
- Stub HR provider is the default when `HR_PROVIDER_MODE` is unset or `stub`.
  Whether this is production-safe is `UNCLEAR`.

Do not preserve these paths silently during cleanup. Prove current usage before
removal, and document compatibility impact if changing them.

## Hidden Coupling

- UI pages encode many route paths, status strings, and role expectations that
  also live in API services and shared schemas.
- `@cueq/shared` Zod schemas are the real contract boundary for many API inputs,
  while OpenAPI DTOs document some shapes separately.
- Tests and mock auth depend on stable seed IDs in `apps/api/src/test-utils/seed-ids.ts`.
- Closing helpers depend on exact translation between core, shared, and Prisma
  status names.
- Roster publish and plan-vs-actual depend on both legacy `Shift.personId` and
  `ShiftAssignment`.
- Report privacy depends on role constants, report helper filtering, UI labels,
  and compliance tests staying aligned.
- Web acceptance config starts API and web servers, builds packages, and resets a
  schema-specific database; test behavior is coupled to local Postgres and
  Playwright browser installation.
- Webhook dispatch security depends on URL validation at both create time and
  dispatch time; do not bypass either path.

## Not Fully Understood

- Full route-by-route response contract parity between DTOs, Zod schemas,
  OpenAPI, and actual service returns.
- Complete workflow side-effect matrix for every `WorkflowType`.
- Full roster `CLOSED` lifecycle beyond schema presence.
- Production readiness of SAML/OIDC/HR provider adapters beyond tests.
- Enforcement coverage for `REPORT_MIN_GROUP_SIZE` across every report.
- Whether terminal import should persist per-row unknown-time-type details.
- Whether HR import's fixed `FLEXTIME`/`2026-01-01` work-time model behavior is a
  pilot simplification or intended production contract.
- Runtime behavior of optional monitoring metrics wiring; docs describe a future
  `/metrics` setup, but inspected app module does not show it registered.
