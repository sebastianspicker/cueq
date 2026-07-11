# Verification Baseline

Date: 2026-05-16

Scope: repository verification discovery and safest available local checks. No
production code was changed.

## Environment Observed

- Node: `v26.0.0`
- pnpm: `9.0.0`
- Declared package manager: `pnpm@9.15.0`
- Docker: `29.5.0`
- Docker Compose: `5.1.3`
- `node_modules`: present
- Local services: `docker compose up -d postgres` started `cueq-postgres` on
  `localhost:5433`.
- Generated/cache output: build, coverage, test, Turbo, Next.js, and Docker
  service artifacts were produced as part of verification. No production source
  files were intentionally modified.

## Commands Discovered

| Area                          | Command                                  |
| ----------------------------- | ---------------------------------------- |
| Install dependencies          | `pnpm install --frozen-lockfile`         |
| Full setup                    | `make setup`                             |
| Full check                    | `make check`                             |
| Fast check                    | `make quick`                             |
| Build                         | `make build` / `pnpm build`              |
| Lint                          | `make lint`                              |
| Format check                  | `make format`                            |
| Typecheck                     | `make typecheck`                         |
| Docs links                    | `make docs-check`                        |
| Schema and fixture validation | `make schemas`                           |
| Generate Prisma/OpenAPI/docs  | `make generate`                          |
| OpenAPI drift check           | `make openapi-check`                     |
| All tests                     | `make test` / `make test-all`            |
| Unit tests                    | `make test-unit`                         |
| Integration tests             | `make test-integration`                  |
| E2E/browser tests             | `make test-e2e`                          |
| Acceptance tests              | `make test-acceptance`                   |
| Compliance tests              | `make test-compliance`                   |
| Backup/restore test           | `make test-backup-restore`               |
| Coverage                      | `make test-coverage`                     |
| Policy golden tests           | `pnpm --filter @cueq/policy test:golden` |
| Open source audit gate        | `pnpm audit --prod --audit-level=high`   |
| Docker config validation      | `docker compose config --quiet`          |
| Shell static analysis         | `shellcheck scripts/*.sh`                |

Required services and generated artifacts discovered:

- PostgreSQL via `docker-compose.yml`, exposed locally on `5433`.
- Prisma client generation through `make setup`, `make generate`, and
  `make db-generate`.
- OpenAPI snapshot generation/checking through `make generate` and
  `make openapi-check`.
- JSON Schema and fixture validation through `make schemas`.
- Playwright browser cache for web acceptance/e2e tests.

## Commands Run

| Command                                  | Result                 | Evidence                                                                                                                                  |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `node --version`                         | PASS                   | `v26.0.0`                                                                                                                                 |
| `pnpm --version`                         | PASS with mismatch     | Installed `9.0.0`; repo declares `pnpm@9.15.0`.                                                                                           |
| `docker --version`                       | PASS                   | `Docker version 29.5.0`.                                                                                                                  |
| `docker compose version`                 | PASS                   | `Docker Compose version v5.1.3`.                                                                                                          |
| `docker compose config --quiet`          | PASS                   | Compose config parsed successfully.                                                                                                       |
| `docker compose up -d postgres`          | PASS                   | Started `cueq-postgres` on port `5433`.                                                                                                   |
| `make docs-check`                        | PASS                   | Markdown link check passed for 64 files.                                                                                                  |
| `make schemas`                           | PASS                   | Domain schemas, fixture schemas, and reference/real-derived fixtures validated.                                                           |
| `make format`                            | FAIL                   | Prettier reported style issues in `AGENTS.md` and `docs/code-index.md`.                                                                   |
| `make lint`                              | PASS with warning      | 10 Turbo tasks passed; warning in `apps/api/src/phase2/controllers/audit.controller.ts` for `@typescript-eslint/consistent-type-imports`. |
| `make typecheck`                         | PASS                   | 10 Turbo tasks passed.                                                                                                                    |
| `make test-unit`                         | PASS                   | 10 Turbo tasks passed; visible totals: shared 10, database 6, policy 60, core 432, web 50, api 204 tests passed.                          |
| `make test-integration`                  | PASS                   | 10 Turbo tasks passed; visible totals: shared 6, database 1, policy 33, core 1, web 2, api 148 tests passed.                              |
| `make test-acceptance`                   | FAIL                   | API/shared/database/policy/core acceptance suites passed, but web Playwright suite failed because Chromium is not installed.              |
| `make test-compliance`                   | PASS                   | 10 Turbo tasks passed; visible totals: shared 1, database 4, policy 10, core 5, web 1, api 41 tests passed.                               |
| `make build`                             | PASS with warning      | 6 Turbo tasks passed; Next.js build completed; warning that the Next.js ESLint plugin was not detected.                                   |
| `make test-coverage`                     | PASS                   | API and core coverage suites passed. Core: 96.47% statements / 93.23% branches. API: 85.36% statements / 84.55% branches.                 |
| `make test-backup-restore`               | PASS with trust caveat | Backup/restore JSON returned `ok: true`; source and restored checksums matched, but the checked public tables were empty.                 |
| `pnpm --filter @cueq/policy test:golden` | PASS with warning      | 111 golden tests passed; pnpm version mismatch warning emitted.                                                                           |
| `make openapi-check`                     | PASS                   | OpenAPI snapshot check passed.                                                                                                            |
| `pnpm audit --prod --audit-level=high`   | FAIL                   | 18 vulnerabilities reported: 3 low, 8 moderate, 7 high. High findings are in `next@15.5.15` / `next-intl` dependency path.                |
| `shellcheck scripts/*.sh`                | PASS                   | No findings emitted.                                                                                                                      |

Commands using `make` and `pnpm` were run with
`NPM_CONFIG_CACHE=/private/tmp/cueq-npm-cache`.

## Failures

### Format Check

`make format` failed because Prettier reported style issues in:

- `AGENTS.md`
- `docs/code-index.md`

This blocks `make check` from being a green full-repo validation at the current
tree state.

### Web Acceptance / Browser Tests

`make test-acceptance` failed in `@cueq/web#test:acceptance`.

Root blocker:

```text
browserType.launch: Executable doesn't exist at
/Users/sebastian/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

Playwright suggested:

```text
pnpm exec playwright install
```

Twenty web acceptance tests failed for this environment reason. Two web tests
passed before the browser-launch failures were reported. The failed areas
included accessibility route checks and Phase 2 web flows for dashboard, roster,
leave/team calendar, approvals, reports, bookings, on-call, policy admin, audit,
and settings.

### Dependency Audit

`pnpm audit --prod --audit-level=high` failed with 18 vulnerabilities:

- 3 low
- 8 moderate
- 7 high

The high findings affect `next@15.5.15`, also through `next-intl@4.8.3`.
Reported advisory categories include denial of service, SSRF via WebSocket
upgrade handling, and middleware/proxy bypass issues. The audit output reported
patched versions at or beyond `15.5.16` and `15.5.18` depending on advisory.

## Skipped Checks

| Check                              | Why skipped                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `make check`                       | Not run after component checks because `make format` already fails and would make the aggregate check fail early.         |
| `make test-all`                    | Not run because it includes the browser acceptance path already blocked by missing Playwright Chromium.                   |
| `make test-e2e`                    | Not run because the same missing Playwright Chromium browser blocks web browser execution.                                |
| `make generate`                    | Not run because it intentionally updates generated Prisma/OpenAPI/docs artifacts; no generation change was requested.     |
| `make setup`                       | Not run because dependencies were already installed; it also starts services and applies database migration setup.        |
| `make db-push` / `make db-migrate` | Not run directly because they mutate databases; test commands performed isolated reset/seed operations for their schemas. |
| `make demo-screenshots`            | Not run because browser execution is blocked until Playwright browsers are installed.                                     |
| CI-only dependency review / CodeQL | Not run locally; GitHub-hosted checks are not equivalent to local shell execution.                                        |

## Suspicious or Noisy Results

- API negative-path tests intentionally log Prisma, OIDC token validation, and
  payload-too-large stack traces while passing. These logs make real failures
  harder to spot in long output.
- Integration and acceptance tests repeatedly reset and seed local PostgreSQL
  schemas. They are useful verification, but they are not read-only.
- `make test-backup-restore` verified backup/restore mechanics against empty
  public tables in this run. It is a valid command result, but weak evidence for
  non-empty production-like data.
- Some suites are thin smoke checks from their names/counts, such as single-test
  database, web, shared, and core acceptance/integration targets. They may be
  useful gates, but they should not be treated as broad behavioral coverage
  without deeper inspection.
- `make build` passed, but emitted a Next.js ESLint plugin warning. The build is
  not blocked by this warning.
- The installed pnpm version does not match the repository's declared package
  manager version. Current checks still ran, but a CI or contributor environment
  using `pnpm@9.15.0` may not be bit-for-bit identical.

## Current Verification State

Verified locally:

- Repository scripts are discoverable through Makefile/package scripts.
- Docker Compose configuration is valid.
- Local PostgreSQL can start through Docker Compose.
- Markdown links passed.
- JSON Schema and fixture validation passed.
- Lint passed with one warning.
- Typecheck passed.
- Unit tests passed.
- Integration tests passed against local PostgreSQL.
- API/shared/database/policy/core acceptance portions passed.
- Compliance tests passed.
- Build passed.
- API/core coverage gates passed.
- Backup/restore command completed successfully with an empty-data caveat.
- Policy golden tests passed.
- OpenAPI snapshot is current.
- Shell scripts passed ShellCheck.

Not verified:

- Full `make check` green state.
- Full `make test-all` green state.
- Web acceptance/e2e browser behavior.
- Demo screenshot generation.
- Generated artifact regeneration cleanliness from `make generate`.
- CI-hosted dependency review and CodeQL behavior.

Blockers for stronger verification:

1. Prettier format failures in `AGENTS.md` and `docs/code-index.md`.
2. Missing local Playwright Chromium browser cache.
3. Production dependency audit failures in Next.js-related packages.
4. pnpm version mismatch between local toolchain and `packageManager`.
