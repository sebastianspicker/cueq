# AGENTS.md - cueq Repository Guidance

Durable guidance for Codex and other coding agents working in this repository.
Keep this file compact. Put one-off prompts, audits, and remediation plans in
task prompts or `plan.md`, not here.

## Project Purpose

cueq is a pnpm + Turborepo monorepo for time tracking, absence management,
shift planning, approvals, payroll export, and audit-grade operations for a
German university in NRW / TV-L context.

The system handles sensitive employment data. Treat privacy, role visibility,
audit immutability, and works-council/reporting constraints as core product
requirements.

## Important Directories

- `apps/api/` - NestJS API server. Runtime bootstrap is `apps/api/src/main.ts`;
  the main module is `apps/api/src/app.module.ts`.
- `apps/web/` - Next.js frontend. Runtime routes live under `apps/web/src/app/`.
- `packages/core/` - Pure domain rules and state machines. Keep I/O out of this
  package.
- `packages/database/` - Prisma schema, migrations, and generated database
  client exports.
- `packages/shared/` - Shared Zod schemas, types, and cross-layer contracts.
- `packages/policy/` - Policy-as-code rules and golden/compliance tests.
- `schemas/` - JSON Schema source contracts for domain and fixture data.
- `contracts/` - Committed public contract snapshots, including OpenAPI.
- `fixtures/` - Synthetic reference data only. Do not add real personal data.
- `scripts/` - Harness scripts used by Makefile, CI, generation, and checks.
- `docs/` - Product, architecture, operations, security, design, and generated
  documentation. Do not hand-edit `docs/generated/*`; regenerate instead.

## Commands

Prefer Makefile targets because they wrap the repo scripts consistently.

Build:

- `make build` - build all packages and apps.
- `make generate` - regenerate Prisma client, OpenAPI snapshot, and generated
  schema docs after contract/schema changes.

Tests:

- `make test` - run the default test suite.
- `make test-unit` - run unit tests.
- `make test-integration` - run integration tests; requires Docker/local
  services.
- `make test-e2e` - run browser end-to-end tests against local app/API.
- `make test-acceptance` - run acceptance tests.
- `make test-compliance` - run GDPR/audit compliance tests.
- `make test-backup-restore` - run backup/restore verification.
- `make test-all` - run all test suites.

Lint, format, and typecheck:

- `make lint` - lint in check mode.
- `make format` - formatting check.
- `make typecheck` - TypeScript `--noEmit`.
- `make quick` - fast local lint + typecheck + unit tests.
- `make check` - full validation: lint, format, typecheck, docs links, schemas,
  tests, and OpenAPI drift.

Development and database:

- `make setup` - install dependencies, start Docker services, generate Prisma,
  and push the dev schema.
- `make dev` - start API and web development servers.
- `make db-generate` - generate Prisma client.
- `make db-push` - push schema to the development database.
- `make db-migrate` - run database migrations.
- `make openapi-check` - compare generated OpenAPI with committed snapshot.
- `make schemas` - validate JSON Schemas and fixture contracts.
- `make docs-check` - validate internal markdown links.

Runtime entry points:

- API: `pnpm --filter @cueq/api dev` or `make dev`; default local API is
  documented as `http://localhost:3001`.
- Web: `pnpm --filter @cueq/web dev`; default local web port is `3000`.
- API production start script: `pnpm --filter @cueq/api start:prod`.
- Web production start script: `pnpm --filter @cueq/web start`.

## Contracts and Compatibility

- Public API contract: NestJS decorators/export in `apps/api/src/openapi*.ts`
  and committed snapshot `contracts/openapi/openapi.json`.
- Storage contract: Prisma schema and migrations in
  `packages/database/prisma/`. Schema changes require generated artifacts and
  migration/fixture/test review.
- Runtime validation contracts: `packages/shared/src/` and `schemas/`.
- Domain contracts: pure rules in `packages/core/src/core/` and policy rules in
  `packages/policy/src/`.
- Fixture contracts: `schemas/fixtures/` and `fixtures/` must stay aligned.
- Privacy/security contracts: audit entries are append-only; role-based access
  and absence-reason visibility must be enforced at API and UI boundaries.

Do not assume an API, schema, config value, dependency, protocol, code path, or
storage behavior exists. Inspect the relevant source and generated/committed
contract before relying on it.

## Deprecated-Code Policy

- Do not keep deprecated compatibility paths unless current code, docs,
  contracts, or tests show they are still required.
- Do not silently preserve old behavior when it is wrong. Fix it or document the
  compatibility impact and required migration path.
- Remove only code made obsolete by the current task. Report unrelated dead code
  instead of cleaning it up opportunistically.

## Code-Change Rules

- Act as a cautious senior engineer.
- Before editing, identify outcome, success criteria, side effects, and required
  verification.
- Read relevant files, exports/public surfaces, immediate callers, tests, shared
  utilities, and affected contracts before changing code.
- Prefer the minimum code that solves the actual problem.
- No speculative features.
- No abstractions for single-use code.
- No broad rewrites without a written plan.
- Touch only files required by the task.
- Match existing style unless it directly causes the problem.
- Keep pure business logic in `packages/core/` when it does not need NestJS,
  Prisma, or browser APIs.
- Do not add production dependencies without explicit approval and a clear
  runtime, maintenance, license, and security rationale.
- Do not add telemetry, analytics, phone-home behavior, secrets, credentials, or
  real personal data.

## Verification Expectations

- Use deterministic tools for build, lint, typecheck, schema validation,
  migrations, formatting, contract drift, and test pass/fail.
- Run the narrowest relevant check first, then broader checks when risk or
  touched surface requires it.
- For behavior changes, add or update tests that verify why the behavior matters,
  not only that a specific output appears.
- For schema/API/storage changes, run generation and drift checks as applicable.
- For UI work, verify user-visible behavior, states, labels, role visibility,
  empty/error/loading states, and status indicators.
- Do not claim completion without evidence.
- If any build, test, lint, migration, edge case, or runtime check was skipped,
  say so explicitly.

## Final Response Expectations

For implementation tasks, final responses must include:

1. Files changed.
2. Why each file changed.
3. Commands run.
4. Tests/checks passed.
5. Tests/checks skipped or unavailable.
6. Remaining uncertainty.
7. Follow-up risks.

For audit-only or planning tasks, include the document created/updated, scope
covered, highest-risk findings, areas not fully inspected, remaining
uncertainty, and the next suggested implementation slice.
