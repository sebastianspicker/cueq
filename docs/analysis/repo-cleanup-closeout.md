# Repo Cleanup Closeout — 2026-03-01

## Scope Completed

This closeout documents the cleanup/refactor pass covering docs/archive hygiene, frontend API-client deduplication, auth/integration deduplication, and MVP UX additions (`bookings`, `on-call`).

## Delivered Changes

### Documentation and Artifacts

- Moved root reconciliation artifacts to:
  - `docs/analysis/archive/2026-03-rc/prd-plan-gap-matrix.md`
  - `docs/analysis/archive/2026-03-rc/missing-items-ranked.md`
  - `docs/analysis/archive/2026-03-rc/status-reconciliation.md`
- Added analysis index: `docs/analysis/index.md`.
- Archived one-off references into `docs/references/archive/`.
- Reconciled stale status language:
  - `docs/product-specs/monthly-closing.md`
  - `docs/product-specs/closing-console.md`
- Rewrote `docs/FRONTEND.md` to current architecture.

### Frontend Refactor and UX

- Introduced shared web API layer:
  - `apps/web/src/lib/api-client.ts`
  - `apps/web/src/lib/api-context.tsx`
- Added foundational shared UI components:
  - `apps/web/src/components/PageShell.tsx`
  - `apps/web/src/components/SectionCard.tsx`
  - `apps/web/src/components/ConnectionPanel.tsx`
  - `apps/web/src/components/StatusBanner.tsx`
  - `apps/web/src/components/FormField.tsx`
- Added shared styles and layout updates:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/app/[locale]/layout.tsx`
- Migrated locale pages to shared `useApiContext` usage and removed page-local API helper duplication.
- Added new UI routes:
  - `apps/web/src/app/[locale]/bookings/page.tsx`
  - `apps/web/src/app/[locale]/oncall/page.tsx`
- Expanded i18n/nav for `bookings` and `oncall`:
  - `apps/web/src/messages/en.json`
  - `apps/web/src/messages/de.json`

### API and Backend Dedup

- Added `GET /v1/oncall/deployments`:
  - `apps/api/src/phase2/controllers/oncall.controller.ts`
  - `apps/api/src/phase2/phase2.service.ts`
- Added query schema:
  - `packages/shared/src/schemas/oncall.ts`
- Added auth role mapping single source:
  - `apps/api/src/common/auth/role-mapping.ts`
  - consumed by mock/OIDC/SAML adapters.
- Added shared integration token validator:
  - `apps/api/src/common/integrations/integration-token.ts`
  - consumed by HR import and terminal gateway services.
- Added shared script arg parser:
  - `scripts/lib/parse-args.mjs`
  - consumed by backfill/import scripts.

### Tests and QoL

- Added web acceptance coverage for new routes/flows:
  - `apps/web/tests/acceptance/phase2.acceptance.spec.ts`
  - `apps/web/tests/acceptance/a11y.acceptance.spec.ts`
- Added API integration coverage for on-call deployment listing:
  - `apps/api/test/integration/phase3.integration.test.ts`
- Added `make` QoL commands:
  - `make quick`
  - `make docs-check`

## Remaining Deferred Work (Post-Cleanup Program)

- Deep logic migration out of `apps/api/src/phase2/phase2.service.ts` after the first extraction layer.
  - Completed in this pass: controller wiring through dedicated domain services under `apps/api/src/phase2/services/` for dashboard/bookings, workflows, and on-call.
  - Deferred: move full method bodies from `phase2.service.ts` into those domain services in follow-up slices.
- Broader conversion of inline page styles into component-level design tokens/classes.
- Additional incremental reductions for large page files (`roster`, `closing`, `reports`).

## Deep Code Inspection Findings (2026-03-01)

This appendix captures the latest deep inspection pass for runtime correctness and security, with priority based on likelihood and impact.

| Finding ID                      | Severity | Probability | Suspicious Area                                                        | Why Suspicious / Failure Mode                                                                                                                                    | Root Cause                                                                           | Resolution                                                                                                                                                                                                          |
| ------------------------------- | -------- | ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-WEBHOOK-URL-001`           | `P1`     | Medium      | `apps/api/src/phase2/phase2.service.ts` webhook endpoint registration  | Webhook targets accepted generic URLs without explicit localhost/private-network restrictions. In production this can become an SSRF pivot via dispatcher calls. | Missing explicit target-host policy at registration time.                            | Added URL guard `apps/api/src/common/http/webhook-url.ts` (protocol + credential checks + private/localhost blocking in production by default), wired into `createWebhookEndpoint`, plus unit/integration coverage. |
| `DATA-BOOKING-INTERVAL-001`     | `P1`     | High        | `packages/shared/src/schemas/booking.ts` (`CreateBookingSchema`)       | Booking creation accepted inverted intervals (`endTime < startTime`), leading to invalid business state and downstream reporting distortions.                    | Missing interval ordering constraint in schema validation.                           | Added schema refinement (`endTime` must be strictly after `startTime`) and integration regression test.                                                                                                             |
| `DATA-TERMINAL-IDEMPOTENCY-001` | `P1`     | Medium      | `apps/api/src/phase2/terminal-gateway.service.ts` import dedupe        | Repeat imports of same terminal file could create duplicate `IMPORT` bookings across batches.                                                                    | Dedupe previously scoped only to a single payload (`seen` set), not persisted state. | Added persisted duplicate lookup on booking identity tuple before create; added integration test for repeated-batch idempotency.                                                                                    |
| `SEC-INPUT-SIZE-001`            | `P2`     | Medium      | CSV ingest surfaces (`terminal` and `hr import`)                       | Large CSV bodies lacked explicit per-field caps at service schema layer (even though body-parser limit existed).                                                 | Validation depth relied on transport limit only.                                     | Added explicit schema max-size guards (`MAX_TERMINAL_CSV_BYTES`, `MAX_HR_IMPORT_CSV_BYTES`) and oversized-payload integration coverage.                                                                             |
| `REL-TEST-HOOK-TIMEOUT-001`     | `P2`     | High        | API integration/acceptance/compliance test hooks under full-suite load | 10s default hook timeout intermittently failed on DB reset/seed under high suite concurrency, cascading into false-negative suite failures.                      | Default Vitest hook timeout too low for environment load profile.                    | Increased API Vitest `hookTimeout`/`testTimeout` in integration/acceptance/compliance configs; increased heavy acceptance `beforeEach` timeout; full `make test-all` now green.                                     |

### Current Status

- `P0`: none identified in this pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly discovered in this pass that required immediate code changes.

### Verification Snapshot

- `make check`: pass
- `make test-all`: pass

## Deep Code Inspection Findings (2026-03-01, Append)

Follow-up deep inspection focused on authorization drift, dispatch-time SSRF posture, and auth guard robustness.

| Finding ID                            | Severity | Probability | Suspicious Area                                                          | Why Suspicious / Failure Mode                                                                                                                                                                                              | Root Cause                                                                                            | Resolution                                                                                                                                                                                                 |
| ------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH-CLOSING-SCOPE-001`              | `P1`     | High        | `apps/api/src/phase2/phase2.service.ts` closing read/checklist endpoints | Closing permissions in spec allow `TEAM_LEAD` (own OU) and `HR/Admin`, but implementation reused a broader approval-role set that also included `SHIFT_PLANNER`. This widened data access for financial closing artifacts. | Cross-domain role-set reuse (`APPROVAL_ROLES`) for a domain with narrower authorization requirements. | Added dedicated `CLOSING_READ_ROLES` and switched `listClosingPeriods`, `getClosingPeriod`, and `closingChecklist` to that set; added integration regressions asserting `SHIFT_PLANNER` denial.            |
| `AUTH-CLOSING-REOPEN-001`             | `P1`     | Medium      | `apps/api/src/phase2/phase2.service.ts` `reopenClosing`                  | Reopen path relied on state-transition policy errors instead of explicit role gate, producing brittle access control and non-authoritative failure semantics.                                                              | Missing endpoint-level authorization guard for reopen action.                                         | Added explicit `HR/Admin` guard in `reopenClosing`; added integration regression asserting `TEAM_LEAD` reopen denial.                                                                                      |
| `DATA-EXPORT-OU-SCOPE-001`            | `P1`     | High        | `apps/api/src/phase2/phase2.service.ts` `exportClosing`                  | OU-scoped closing exports selected all time accounts in the period, allowing cross-organization data to leak into payroll artifacts.                                                                                       | Missing organization-unit predicate in export account query.                                          | Scoped export query by `closingPeriod.organizationUnitId` when present and added integration regression asserting non-target OU accounts are excluded.                                                     |
| `AUTH-CLOSING-ADMIN-PARITY-001`       | `P2`     | Medium      | `packages/core/src/core/closing/index.ts` transition engine              | Service-level role guards permitted Admin for reopen/correction, but transition engine still rejected non-HR actors, causing spec/behavior drift and unexpected 400 responses for Admin flows.                             | Authorization policy duplicated across layers with inconsistent role sets.                            | Updated core transition rules to allow `ADMIN` for `REOPEN` and `POST_CLOSE_CORRECTION`; added core and API integration regressions.                                                                       |
| `SEC-WEBHOOK-DISPATCH-REVALIDATE-001` | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` webhook dispatch loop            | Endpoint URL policy was validated on create, but not revalidated at dispatch. Existing records (or policy flips over time) could still trigger disallowed targets.                                                         | Validation only at write-time, no read-time safety check before network egress.                       | Added dispatch-time URL revalidation via `assertWebhookTargetUrl` before `fetch`; invalid targets now create failed delivery records and do not dispatch; added integration test for policy-flip scenario. |
| `REL-AUTH-HEADER-TYPE-001`            | `P3`     | Low         | `apps/api/src/common/guards/auth.guard.ts`                               | Guard assumed `authorization` header is always a string; duplicated header forms could surface `string[]` and cause avoidable runtime type errors.                                                                         | Overly narrow request-header typing in guard.                                                         | Hardened guard to handle both string and array header forms, then normalize to a single bearer token value before parsing.                                                                                 |

### Current Status (Append)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: all discovered issues above are resolved.

## Deep Code Inspection Findings (2026-03-01, Append II)

Follow-up pass focused on workflow side-effect consistency, on-call idempotency, and frontend request-client correctness.

| Finding ID                            | Severity | Probability | Suspicious Area                                                                | Why Suspicious / Failure Mode                                                                                                                          | Root Cause                                                                               | Resolution                                                                                                                                                                                                     |
| ------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA-OVERTIME-PRECONDITION-001`      | `P1`     | High        | `apps/api/src/phase2/phase2.service.ts` overtime workflow creation             | Overtime approval workflows could be created for periods without a matching `timeAccount`, causing approval-time side-effect failures/inconsistency.   | Missing precondition validation at workflow creation.                                    | Added precheck for matching account range in `createOvertimeApprovalWorkflow`; request now fails fast with `400` when no account exists. Added integration regression in `fr500.integration.test.ts`.          |
| `DATA-ONCALL-DEPLOYMENT-DUP-001`      | `P2`     | High        | `apps/api/src/phase2/phase2.service.ts` on-call deployment creation            | Re-submitting the same deployment window could create duplicate deployments (and duplicate deployment-derived bookings), inflating totals/audit noise. | No uniqueness/idempotency check on `(personId, rotationId, startTime, endTime)` payload. | Added duplicate lookup before insert and return `409 Conflict` for identical deployment payloads. Added integration regression in `phase3.integration.test.ts`.                                                |
| `API-ONCALL-RANGE-VALIDATION-001`     | `P3`     | Medium      | `apps/api/src/phase2/phase2.service.ts` on-call list endpoints                 | Inverted query windows (`from > to`) were silently accepted, producing ambiguous/empty responses instead of deterministic input errors.                | Missing chronological guard for filter range parameters.                                 | Added explicit range validation for both `listOnCallRotations` and `listOnCallDeployments` and added integration regressions asserting `400` behavior.                                                         |
| `WEB-API-CLIENT-HEADER-MERGE-001`     | `P2`     | Medium      | `apps/web/src/lib/api-client.ts`                                               | Client merged headers via object spread; `Headers` instances and tuple headers could be dropped, and `Content-Type` was forced on bodyless requests.   | Header handling assumed plain object shape and always injected JSON content-type.        | Switched to `new Headers(init?.headers)` normalization, preserved caller-provided header forms, injected `Authorization` safely, and set `Content-Type` only when a request body is present. Unit tests added. |
| `SEC-INTEGRATION-TOKEN-NORMALIZE-001` | `P3`     | Low         | `apps/api/src/common/integrations/integration-token.ts`                        | Integration-token comparison rejected values with surrounding whitespace from transport normalization differences.                                     | Received token value was not normalized before constant-time comparison.                 | Added `trim()` normalization for inbound token before `timingSafeEqual` and added unit regression in `integration-token.test.ts`.                                                                              |
| `AUTH-SHIFT-SWAP-OU-CONTEXT-001`      | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` shift-swap workflow assignment context | Shift-swap assignment context used requester OU instead of shift OU, which can misroute fallback/delegation chains in cross-person/cross-OU flows.     | Incorrect `requesterOrganizationUnitId` source passed into workflow-assignment builder.  | Updated shift-swap assignment context to use `shift.roster.organizationUnitId` so approver resolution/delegation align with the affected roster unit.                                                          |

### Current Status (Append II)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: all discovered issues above are resolved.

## Deep Code Inspection Findings (2026-03-01, Append III)

Follow-up pass focused on webhook URL hardening edge-cases and workflow approval consistency under stale state.

| Finding ID                            | Severity | Probability | Suspicious Area                                                             | Why Suspicious / Failure Mode                                                                                                                                                  | Root Cause                                                                                              | Resolution                                                                                                                                                                                                                                           |
| ------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-WEBHOOK-HOST-NORMALIZATION-001`  | `P1`     | High        | `apps/api/src/common/http/webhook-url.ts` hostname private-target detection | Production webhook URL checks could be bypassed by trailing-dot hostnames (for example `localhost.` / `127.0.0.1.`), allowing private-target dispatch despite guard intent.    | Hostname normalization did not canonicalize trailing-dot variants before classification.                | Added canonical hostname normalization (trim/lowercase/strip trailing dots) before localhost/private-IP checks and `isIP` classification; added regression coverage in `webhook-url.test.ts`.                                                        |
| `DATA-WORKFLOW-APPROVAL-PRECHECK-001` | `P1`     | High        | `apps/api/src/phase2/phase2.service.ts` workflow decision approval path     | Approval side-effects can fail when entity state drifts (for example shift assignments changed pre-approval), risking status/action divergence if preconditions are unchecked. | Decision status transition executed without explicit preflight validation of side-effect prerequisites. | Added approval pre-checks for `SHIFT_SWAP` and `OVERTIME_APPROVAL` before transition execution (including stale assignment/account checks). Added integration regression asserting stale shift-swap approval fails while workflow remains `PENDING`. |

### Current Status (Append III)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: none newly identified in this append pass.
- `P3`: none newly identified in this append pass.

## Deep Code Inspection Findings (2026-03-01, Append IV)

Follow-up pass focused on request trust boundaries and race-window consistency in workflow side effects.

| Finding ID                         | Severity | Probability | Suspicious Area                                                               | Why Suspicious / Failure Mode                                                                                                                                                                 | Root Cause                                                                                               | Resolution                                                                                                                                                                                                                                             |
| ---------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA-BOOKING-SOURCE-BOUNDARY-001` | `P1`     | High        | `apps/api/src/phase2/phase2.service.ts` `createBooking`                       | Authenticated clients could submit integration-reserved sources (`IMPORT`, `TERMINAL`) through `/v1/bookings`, enabling source provenance spoofing and inconsistent audit/report semantics.   | Endpoint accepted the full `BookingSource` enum without API-surface allowlist constraints.               | Added explicit rejection for `IMPORT`/`TERMINAL` on authenticated booking creation path with deterministic `400` message. Added integration regression in `test/integration/phase3.integration.test.ts`.                                               |
| `DATA-SHIFT-SWAP-APPLY-RACE-001`   | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` shift-swap approval apply transaction | In race windows where target assignment appears between precheck and apply, code could remove `fromPerson` assignment and silently skip `toPerson` create, leaving partial/ambiguous outcome. | Apply-transaction branch tolerated `toPerson` already-assigned state instead of failing atomically.      | Hardened apply transaction to fail fast when `toPerson` is already assigned and to always perform explicit delete+create swap on valid state. This keeps side-effect semantics aligned with workflow intent under concurrent state changes.            |
| `SEC-AUTH-HEADER-AMBIGUITY-001`    | `P2`     | Medium      | `apps/api/src/common/guards/auth.guard.ts` authorization parsing              | Multiple `Authorization` headers were accepted and collapsed to the last value, creating ambiguous auth semantics and potential header-smuggling bypass conditions across proxy chains.       | Header normalization strategy selected one array element instead of rejecting multi-value Authorization. | Guard now rejects multi-value `Authorization` headers with `401` and accepts only a single bearer header. Added unit regressions in `src/common/guards/auth.guard.test.ts` for single-header success, multi-header rejection, and public-route bypass. |

### Current Status (Append IV)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly identified in this append pass.

## Deep Code Inspection Findings (2026-03-01, Append V)

Follow-up pass focused on header-normalization trust boundaries and partial-update state validation in workflow delegation.

| Finding ID                             | Severity | Probability | Suspicious Area                                                           | Why Suspicious / Failure Mode                                                                                                                                                           | Root Cause                                                                                 | Resolution                                                                                                                                                                                                                                                |
| -------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA-DELEGATION-WINDOW-PATCH-001`     | `P1`     | High        | `apps/api/src/phase2/workflow-runtime.service.ts` `updateDelegation`      | Partial delegation updates (only `activeFrom` or only `activeTo`) could persist invalid active windows (`activeTo <= activeFrom`), causing delegation selection drift and policy bleed. | Validation only checked patch payload fields, not effective persisted window after merge.  | Added effective-window validation in `updateDelegation` using current + patch values before write. Added FR-500 integration regression for both invalid partial-patch paths in `apps/api/test/integration/fr500.integration.test.ts`.                     |
| `SEC-INTEGRATION-HEADER-AMBIGUITY-001` | `P2`     | Medium      | `apps/api/src/common/integrations/integration-token.ts` + token endpoints | Multi-value `x-integration-token` headers could surface as arrays and trigger a runtime type mismatch (`trim` on non-string), yielding a 500-path instead of deterministic rejection.   | Integration token normalization assumed a single string header shape from transport layer. | Hardened `assertIntegrationToken` to normalize single-string vs array header inputs and reject multi-value headers as invalid tokens. Added unit regression in `integration-token.test.ts`; widened controller/service token parameter types accordingly. |

### Current Status (Append V)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly identified in this append pass.

## Deep Code Inspection Findings (2026-03-01, Append VI)

Follow-up pass focused on SSRF bypass paths in webhook dispatch (`DNS rebinding` and `redirect-follow` behavior).

| Finding ID                       | Severity | Probability | Suspicious Area                                                         | Why Suspicious / Failure Mode                                                                                                                                                                                                                                                                          | Root Cause                                                                             | Resolution                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-WEBHOOK-DNS-REBIND-001`     | `P1`     | High        | `apps/api/src/common/http/webhook-url.ts` + webhook dispatch validation | URL validation only classified literal host strings (IP/localhost), but did not evaluate DNS resolution results. Hostnames that resolve to private addresses (for example wildcard/rebinding domains) could bypass private-target blocking in production and cause internal-network dispatch attempts. | Validation was hostname-string based; no dispatch-time DNS-to-IP trust-boundary check. | Added dispatch-time DNS resolution enforcement in `assertWebhookDispatchTargetUrl` (`lookup(..., { all: true, verbatim: true })`) and rejection when any resolved address is private/local. Kept existing create-time validation and added unit coverage in `apps/api/src/common/http/webhook-url.test.ts`. |
| `SEC-WEBHOOK-REDIRECT-CHAIN-001` | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` webhook delivery fetch          | Delivery fetch used default redirect behavior, so a nominally valid public target could redirect to a disallowed/private address and still be contacted. This creates an SSRF side channel through HTTP redirect chains even when initial endpoint validation is present.                              | Webhook dispatch did not constrain redirect handling at HTTP client level.             | Set webhook delivery fetch to `redirect: 'manual'` so redirects are not auto-followed, and combined it with dispatch-time target validation (`assertWebhookDispatchTargetUrl`) before every attempt. This closes both direct and redirected private-target bypass paths in the runtime dispatch loop.       |

### Current Status (Append VI)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly identified in this append pass.

## Deep Code Inspection Findings (2026-03-01, Append VII)

Follow-up pass focused on auth-provider fail-closed behavior, authorization-check ordering, and webhook delivery storage bounds.

| Finding ID                                | Severity | Probability | Suspicious Area                                                      | Why Suspicious / Failure Mode                                                                                                                                                     | Root Cause                                                                                      | Resolution                                                                                                                                                                                                                         |
| ----------------------------------------- | -------- | ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-AUTH-CONFIG-FALLBACK-001`            | `P1`     | High        | `apps/api/src/common/auth/auth.service.ts` provider selection        | Invalid `AUTH_PROVIDER` (or unsupported legacy `AUTH_MODE`) values fell back to implicit selection, which can silently activate mock auth instead of failing closed on misconfig. | Missing explicit validation for unsupported auth configuration values before provider fallback. | Added strict allowlisting for `AUTH_PROVIDER` (`mock`, `oidc`, `saml`) and legacy `AUTH_MODE` (`mock`, `oidc`) with immediate constructor errors on unsupported values. Added unit regressions in auth tests.                      |
| `AUTH-REPORT-GATE-ORDER-001`              | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` `reportCustomPreview`        | Query validation ran before role authorization, so unauthorized callers could receive validation semantics (`400`) instead of deterministic `403` access denial.                  | Authorization guard executed after schema parsing.                                              | Moved `assertCanReadReports(user)` to the start of `reportCustomPreview`, ensuring deny-first behavior. Added compliance regression in `apps/api/test/compliance/phase2.compliance.test.ts` for employee access to custom preview. |
| `REL-WEBHOOK-DELIVERY-STORAGE-BOUNDS-001` | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` webhook delivery persistence | Delivery `responseBody` and error text were stored unbounded, allowing oversized downstream responses/errors to bloat DB rows and listing payloads.                               | No truncation bound before persistence for webhook delivery diagnostics.                        | Added bounded truncation helpers (`WEBHOOK_RESPONSE_BODY_MAX_CHARS`, `WEBHOOK_ERROR_MAX_CHARS`) and applied them to stored response/error fields in dispatch flow.                                                                 |

### Current Status (Append VII)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly identified in this append pass.

### Verification Snapshot (Append VII)

- `pnpm --filter @cueq/api exec vitest run src/common/auth/auth.service.test.ts`: pass
- `pnpm --filter @cueq/api exec vitest run test/compliance/phase2.compliance.test.ts --config vitest.compliance.config.ts`: pass
- `pnpm --filter @cueq/api exec vitest run test/integration/phase3.integration.test.ts --config vitest.integration.config.ts`: pass
- `make check`: pass
- `make test-all`: pass

## Deep Code Inspection Findings (2026-03-01, Append VIII)

Follow-up pass focused on webhook dispatch memory safety and deterministic role mapping for multi-role identity claims.

| Finding ID                        | Severity | Probability | Suspicious Area                                                           | Why Suspicious / Failure Mode                                                                                                                                          | Root Cause                                                                                   | Resolution                                                                                                                                                                                           |
| --------------------------------- | -------- | ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REL-WEBHOOK-RESPONSE-BUFFER-001` | `P2`     | Medium      | `apps/api/src/phase2/phase2.service.ts` webhook dispatch response reading | Webhook dispatch read full downstream response bodies via `response.text()` before truncation, so a misbehaving endpoint could force large in-memory buffering spikes. | Truncation was applied after full body materialization, not during stream consumption.       | Added bounded streaming reader `readResponseBodyWithLimit` in `apps/api/src/common/http/read-response-body.ts` and used it in webhook dispatch. Added unit coverage in `read-response-body.test.ts`. |
| `AUTH-MULTI-ROLE-ORDER-001`       | `P2`     | Medium      | `apps/api/src/common/auth/oidc-identity-provider.adapter.ts` role mapping | Multi-role OIDC claims resolved to the first mapped role, making effective permissions dependent on claim order from the IdP payload.                                  | Role selection strategy did not define deterministic precedence across multiple valid roles. | Added deterministic highest-priority role selection (`selectHighestRoleClaim`) in `role-mapping.ts`, wired OIDC adapter to it, and added unit coverage in `role-mapping.test.ts`.                    |

### Current Status (Append VIII)

- `P0`: none identified in this append pass.
- `P1`: none newly identified in this append pass.
- `P2`: all discovered issues above are resolved.
- `P3`: none newly identified in this append pass.

### Verification Snapshot (Append VIII)

- `pnpm --filter @cueq/api exec vitest run src/common/http/read-response-body.test.ts src/common/auth/role-mapping.test.ts src/common/auth/auth.service.test.ts`: pass
- `pnpm --filter @cueq/api exec vitest run test/compliance/phase2.compliance.test.ts --config vitest.compliance.config.ts`: pass
- `pnpm --filter @cueq/api exec vitest run test/integration/phase3.integration.test.ts --config vitest.integration.config.ts`: pass
- `make check`: pass
- `make test-all`: pass

## Deep Code Inspection Findings (2026-03-01, Append IX)

Follow-up pass focused on bearer-token trust boundaries, production webhook transport security, and truncation-edge correctness in bounded response reading.

| Finding ID                               | Severity | Probability | Suspicious Area                                       | Why Suspicious / Failure Mode                                                                                                                                                               | Root Cause                                                                                 | Resolution                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | -------- | ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-WEBHOOK-PROD-HTTP-001`              | `P1`     | Medium      | `apps/api/src/common/http/webhook-url.ts`             | Production webhook registration accepted public `http://` targets when private-target override was not enabled, allowing cleartext delivery of event payloads across untrusted networks. | Protocol policy did not distinguish production transport requirements for public targets. | Added production guard in `assertWebhookTargetUrl` to reject public `http://` targets unless private-target mode is explicitly enabled. Added unit regression `rejects public http targets in production when private-target override is not enabled` in `webhook-url.test.ts`. |
| `SEC-AUTH-BEARER-SIZE-001`               | `P2`     | Medium      | `apps/api/src/common/guards/auth.guard.ts`            | Authorization parsing accepted arbitrarily long bearer tokens and control characters, increasing parser/verification cost and malformed-header ambiguity at auth boundary.                 | Missing token-shape hardening in guard prior to provider verification.                     | Added bearer token hardening in `AuthGuard`: max length cap (`4096`) and control-character rejection before `verifyToken`. Added unit regressions for oversized and malformed token cases in `auth.guard.test.ts`.                                              |
| `REL-WEBHOOK-TRUNCATION-FLUSH-EDGE-001`  | `P3`     | Low         | `apps/api/src/common/http/read-response-body.ts`      | Bounded response reader could exceed the configured max when trailing decoder flush output was appended after loop completion, producing off-by-limit truncation behavior.                | Max-length enforcement was applied during stream loop, but not consistently on flush path. | Refactored bounded reader to enforce `maxChars` on both streamed chunks and decoder flush output; preserves truncation marker semantics. Added unit regression using truncated UTF-8 flush behavior in `read-response-body.test.ts`.                               |

### Current Status (Append IX)

- `P0`: none identified in this append pass.
- `P1`: all discovered issues above are resolved.
- `P2`: all discovered issues above are resolved.
- `P3`: all discovered issues above are resolved.

### Verification Snapshot (Append IX)

- `pnpm --filter @cueq/api exec vitest run src/common/guards/auth.guard.test.ts src/common/http/webhook-url.test.ts src/common/http/read-response-body.test.ts`: pass
- `make check`: pass
- `make test-all`: pass
