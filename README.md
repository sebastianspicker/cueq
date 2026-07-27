# cueq

cueq is a TypeScript monorepo for evaluating workforce time recording,
absence and leave management, roster and on-call planning, approvals, monthly
closing, payroll export, reporting, and audit records in a German university
context.

## Project purpose and scope

The repository combines:

- a NestJS HTTP API;
- a German-first Next.js web interface with English translations;
- PostgreSQL persistence through Prisma;
- pure domain rules for time, leave, roster, workflow, closing, and audit
  behavior;
- shared Zod and JSON Schema contracts;
- policy rules and golden-case tests; and
- synthetic fixtures for local development and verification.

This is a source alpha for local evaluation. It is not a hosted service or an
approved system for institutional use. Do not load real employee, payroll,
health, credential, or operational data.

The current release evidence and unresolved gates are recorded in
[RELEASE_STATUS.md](RELEASE_STATUS.md).

## Current capabilities

The current source implements:

- time bookings, break and rest rules, flextime, surcharges, and plausibility
  checks;
- absence requests, leave allocation, balances, adjustments, and team calendar
  views;
- rosters, shift assignments, plan-versus-actual reporting, and on-call
  rotations;
- workflow assignment, approval, delegation, escalation, and monthly closing;
- payroll CSV and XML export preparation;
- aggregate, audit, and compliance reports with role and minimum-group checks;
- append-only audit records enforced against row updates and deletes by a
  PostgreSQL migration;
- terminal batch import, HR master-data import, webhooks, and outbox processing;
  and
- mock, OIDC, and SAML-bridge bearer-token authentication adapters.

The committed OpenAPI snapshot is
[`contracts/openapi/openapi.json`](contracts/openapi/openapi.json). Product
behavior and source entry points are indexed in
[`docs/product-specs/`](docs/product-specs/).

## Current limitations

- The browser has no complete SSO, refresh-token, or session lifecycle. Local
  evaluation uses mock bearer tokens held in memory.
- Automated retention, erasure, personal-data export, and pseudonymization are
  not implemented.
- Audit rows are protected against `UPDATE` and `DELETE`. The repository does
  not implement hash chaining, signatures, external witnessing, or `TRUNCATE`
  protection.
- Terminal and HR machine routes use shared integration tokens. Physical device
  identity and terminal controls are outside this repository.
- Runtime status is limited to liveness, authenticated operational health, and
  integration-token terminal health. There is no metrics endpoint, tracing
  stack, log shipping, dashboard, or alert delivery.
- The repository contains no deployment workflow, container image for the
  applications, reverse proxy, TLS configuration, rollback controller, or
  production secret store.
- Passing repository checks does not establish legal, data-protection,
  works-council, accessibility, security, or operational approval.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the remaining production-assessment
work.

## Requirements and prerequisites

- Node.js 20.19.0 or later
- pnpm 9.15.0
- GNU Make and Bash
- Docker with Docker Compose for PostgreSQL-backed workflows
- Chromium installed through Playwright for browser tests
- PostgreSQL client tools or the configured PostgreSQL client container for the
  backup and restore drill

The repository pins Node.js in [`.node-version`](.node-version), pnpm in
[`package.json`](package.json), and workspace dependency versions in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml).

## Installation

Create a local environment file and a 32-byte webhook encryption key:

```bash
cp .env.example .env
openssl rand -base64 32
```

Set the resulting value as `WEBHOOK_SECRET_ENCRYPTION_KEY` in `.env`. Keep that
file local.

Install dependencies, attempt to start the local Compose services, generate the
Prisma client, and apply committed migrations:

```bash
make setup
```

Load the synthetic evaluation records:

```bash
./scripts/pnpm.sh --filter @cueq/database db:seed:phase2
```

If Compose cannot start, `make setup` continues against the configured
`DATABASE_URL`, and migration deployment must still succeed. If Compose starts
successfully and migration deployment fails, the script treats the local
database as disposable: it removes the cueq Compose volumes, recreates the
services, and retries once. Do not run it against data you need to keep.

## Configuration

The root `.env.example` is the local configuration template. Runtime variables,
defaults, validation rules, and production requirements are documented in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

The minimum local settings are:

```dotenv
DATABASE_URL=postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public
AUTH_PROVIDER=mock
WEBHOOK_SECRET_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

Do not reuse the Compose credentials or mock authentication outside an isolated
local environment.

## Usage

Start the API and web development servers:

```bash
make dev
```

The default local endpoints are:

- web interface: <http://localhost:3000>
- API: <http://localhost:3001>
- OpenAPI UI in non-production mode: <http://localhost:3001/api/docs>
- Keycloak development service: <http://localhost:8081>
- PostgreSQL: `localhost:5433`

Both development servers bind to `127.0.0.1` by default. `CUEQ_DEV_HOST`
overrides the development bind host but does not change the API CORS allowlist.

For the mock-token walkthrough and synthetic data details, use the
[alpha evaluation guide](docs/ALPHA.md).

## Repository structure

| Path                 | Responsibility                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api/`          | NestJS API, authentication, domain orchestration, integrations, reporting, and health routes |
| `apps/web/`          | Next.js App Router interface, locale messages, shared components, and browser tests          |
| `packages/core/`     | Pure domain calculations and state machines                                                  |
| `packages/database/` | Prisma schema, migrations, client export, seeds, and database maintenance scripts            |
| `packages/policy/`   | Policy rules, catalog, golden cases, and compliance tests                                    |
| `packages/shared/`   | Shared Zod schemas, types, and date utilities                                                |
| `contracts/`         | Committed public contract snapshots                                                          |
| `schemas/`           | JSON Schema source contracts                                                                 |
| `fixtures/`          | Synthetic calendar, integration, identity, and reference data                                |
| `scripts/`           | Setup, development, validation, generation, migration, and maintenance entry points          |
| `docs/`              | Architecture, configuration, operations, security, product, and release documentation        |

See [ARCHITECTURE.md](ARCHITECTURE.md) for runtime boundaries and request flow.

## Development workflow

Use Make targets as the stable repository entry points:

```bash
make help
make dev
make quick
```

`make quick` runs lint, TypeScript toolchain verification and type checking,
then unit tests. Run a focused workspace command when a smaller check is
available, then run the broadest practical repository gate before opening a
pull request.

For API, schema, or Prisma changes:

```bash
make generate
make schemas
make openapi-check
```

`make generate` updates the Prisma client, OpenAPI snapshot, domain JSON Schema
index, and shared schema types. Review the resulting diff.

## Testing

| Command                    | Scope                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| `make lint`                | ESLint across all workspaces                                         |
| `make format`              | Prettier check                                                       |
| `make typecheck`           | Pinned TypeScript toolchain check and workspace type checking        |
| `make test-unit`           | Unit and smoke tests plus repository script tests                    |
| `make test-coverage`       | Configured coverage thresholds                                       |
| `make test-integration`    | PostgreSQL-backed integration suites                                 |
| `make test-e2e`            | Playwright end-to-end suite                                          |
| `make test-acceptance`     | API, package, and browser acceptance suites                          |
| `make test-compliance`     | Privacy and audit compliance suites                                  |
| `make test-backup-restore` | PostgreSQL dump, restore, count, checksum, and audit verification    |
| `make test-all`            | Unit, integration, acceptance, compliance, golden, and restore tests |
| `make schemas`             | JSON Schema and fixture validation                                   |
| `make docs-check`          | Internal Markdown link validation                                    |
| `make knip`                | Unused files, exports, dependencies, and binaries                    |
| `make build`               | All packages and applications                                        |
| `make check`               | Ordered full repository gate                                         |

`make check` requires PostgreSQL and runs the service-backed suites. Browser
checks also require the Playwright Chromium revision. The exact gate sequence
is documented in [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md).

## Deployment and operation

The repository does not provide an automated deployment.

After building with `make build`, the application start commands are:

```bash
pnpm --filter @cueq/api start:prod
pnpm --filter @cueq/web start
```

These commands do not provision PostgreSQL, apply migrations, configure TLS,
inject secrets, configure an identity provider, or supervise the processes. A
deployment must provide those controls and must apply committed migrations
with:

```bash
pnpm --filter @cueq/database db:migrate:deploy
```

The local [`docker-compose.yml`](docker-compose.yml) provides PostgreSQL and
Keycloak with synthetic credentials on loopback-bound ports. It is not a
production deployment definition.

Operational procedures and health-route behavior are documented in
[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) and
[docs/RELIABILITY.md](docs/RELIABILITY.md).

## Troubleshooting

- `P1001` from Prisma means PostgreSQL is not reachable through
  `DATABASE_URL`. Check the URL, container state, and mapped port.
- `make dev` fails when the selected environment file is missing or unreadable.
  It uses `.env` by default and accepts another path through `CUEQ_ENV_FILE`.
- API startup fails when `WEBHOOK_SECRET_ENCRYPTION_KEY` is absent, malformed,
  or not exactly 32 decoded bytes.
- Mock authentication is rejected when `NODE_ENV=production`. Configure OIDC or
  the SAML bridge for a production-mode process.
- A stale `node_modules` tree can disagree with the lockfile. Reinstall with
  `./scripts/pnpm.sh install --frozen-lockfile`.
- Browser tests require the Chromium revision for Playwright 1.58.2. Install it
  with `pnpm --filter @cueq/web exec playwright install chromium`.
- `make clean` removes build output, dependencies, and local Compose volumes.
  Do not use it when local database state must be retained.

## Security considerations

cueq processes employment and absence data, including health-related
information. The repository must be evaluated with synthetic data only.

- Authorization is enforced at API boundaries. UI visibility is not a security
  boundary.
- Production mode rejects mock authentication and local fallback integration
  tokens.
- Webhook signing secrets require an operator-supplied AES-256-GCM key.
- CORS defaults to local origins outside production and to an empty allowlist in
  production.
- TLS, encryption at rest, backup protection, log handling, identity-provider
  policy, retention, and incident response are deployment responsibilities.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md).
The detailed trust boundaries and known gaps are in
[docs/SECURITY.md](docs/SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing source, contracts, or
documentation. Use synthetic fixtures, keep changes focused, update affected
tests and contracts, and report checks that could not be run.

Community and support information:

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Release process](docs/RELEASING.md)

## License

[MIT](LICENSE), Copyright (c) 2026 Sebastian J. Spicker.
