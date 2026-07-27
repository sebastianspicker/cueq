# Architecture

cueq is a pnpm and Turborepo monorepo with two applications and four shared
packages. PostgreSQL is the only persistent application store.

## Runtime components

| Component       | Entry point                              | Responsibility                                                                                                        |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Web application | `apps/web/src/app/[locale]/`             | Localized Next.js interface, role-conditioned navigation, and API requests                                            |
| API application | `apps/api/src/main.ts`                   | HTTP transport, authentication, authorization, validation, domain orchestration, integrations, and operational routes |
| Database        | `packages/database/prisma/schema.prisma` | PostgreSQL model and committed migrations                                                                             |
| Scheduled work  | `apps/api/src/phase2/phase2.module.ts`   | Closing cutoff, workflow escalation, and webhook dispatch tasks inside the API process                                |

The web application sends `/api/*` requests through the Next.js rewrite to the
API during local development. The API is the authorization boundary. The web
application uses role information to shape navigation and presentation, but it
must not be relied on to protect data.

## Package boundaries

| Package          | Boundary                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `@cueq/core`     | Pure calculations and state machines for time, absence, roster, closing, workflow, and audit behavior |
| `@cueq/database` | Prisma client export, schema, migrations, seeds, and database maintenance commands                    |
| `@cueq/policy`   | Versioned policy catalog, time and leave rules, and golden cases                                      |
| `@cueq/shared`   | Zod schemas, shared types, date helpers, and cross-layer contracts                                    |

`packages/core` and `packages/policy` do not own HTTP or database access.
Controllers and services in `apps/api` coordinate authentication, role checks,
transactions, persistence, audit records, and outbox effects.

## API structure

The API composition root is `apps/api/src/app.module.ts`. It imports:

- `PrismaModule` for database access;
- `AuthModule` for bearer-token verification and route guards;
- `ScheduleModule` for in-process scheduled work;
- `Phase2Module` for workforce domain controllers and services; and
- `HealthModule` for liveness and operational health.

Most domain requests follow this path:

```text
controller
  -> domain service
  -> helper or runtime service
  -> core or policy rule
  -> Prisma transaction
  -> audit entry and outbox event
```

Controllers own HTTP shape, guards, role metadata, and input parsing. Domain
services own transaction and workflow orchestration. Reusable calculations
belong in a package when they do not require NestJS, Prisma, or browser APIs.

The `apps/api/src/phase2/` name is historical, but the directory is the current
home of time, absence, roster, on-call, workflow, closing, reporting, terminal,
HR, and webhook functionality. New code should follow the existing
domain-oriented controller, service, DTO, and helper boundaries until that
directory is deliberately reorganized.

## Web structure

The web application uses the Next.js App Router:

```text
apps/web/src/
  app/
    (redirect)/
    [locale]/
    globals.css
  components/
  i18n/
  lib/
  messages/
```

The root redirect group sends users into the localized route tree. German is
the default locale, with English messages available through `next-intl`.
`AppWorkspace` loads `/v1/me`, maintains the in-memory API connection, and
derives navigation from the authenticated role.

See [docs/FRONTEND.md](docs/FRONTEND.md) for the current route list and frontend
conventions.

## Contracts

The repository has several contract layers:

- HTTP contract: NestJS controllers and the committed OpenAPI snapshot in
  `contracts/openapi/openapi.json`
- Storage contract: Prisma schema and migrations in
  `packages/database/prisma/`
- Runtime validation: Zod schemas in `packages/shared/src/schemas/`
- Domain rules: `packages/core/src/core/` and `packages/policy/src/`
- Fixture contracts: JSON Schemas in `schemas/fixtures/` and synthetic data in
  `fixtures/`

`make generate` refreshes the Prisma client, OpenAPI snapshot, database schema
reference, and shared schema types. `make openapi-check` compares a newly
exported document with the committed OpenAPI snapshot.

## Persistence and transactions

Prisma models people, organization units, work-time models, bookings, time
accounts, absences, leave adjustments, rosters, shifts, workflows, closing
periods, export runs, integrations, and audit records.

Domain services use Prisma transactions for related state changes. Selected
concurrent workflows also use PostgreSQL advisory locks, unique constraints,
or conditional updates. Audit records are appended with domain changes. The
migration `20260715090000_enforce_audit_entry_immutability` rejects row updates
and deletes after it is applied.

The audit control is not a cryptographic ledger. It does not protect against
`TRUNCATE`, privileged database administration, or modification outside the
reviewed deployment boundary.

The current domain JSON Schema index is
[docs/generated/db-schema.md](docs/generated/db-schema.md).

## Authentication and authorization

The API supports three identity adapters:

- `mock` for local and test use;
- `oidc` for issuer and audience verified access tokens using remote JWKS; and
- `saml` for JWTs produced by an external SAML bridge.

Production mode rejects mock authentication. Route guards verify bearer tokens
and enforce role metadata. Machine routes for terminal and HR import use
separate integration tokens.

Authentication settings and defaults are documented in
[docs/CONFIGURATION.md](docs/CONFIGURATION.md). Role and privacy boundaries are
documented in [docs/SECURITY.md](docs/SECURITY.md).

## Integrations

The current source includes:

- terminal heartbeat, batch sync, and CSV ingestion;
- an HR import pipeline with stub and HTTP provider adapters;
- payroll export records and CSV or XML artifacts;
- webhook endpoint registration, encrypted signing secrets, outbox claims,
  delivery attempts, and retry state; and
- OIDC and SAML-bridge identity adapters.

Physical terminal behavior, identity-provider administration, payroll-provider
acceptance, outbound network policy, and external job supervision are outside
the repository.

## Runtime status

The API exposes:

- `GET /health` for public process liveness;
- `GET /health/ready` for authenticated HR and administrator operational state;
  and
- `GET /v1/terminal/health` for integration-token-protected terminal state.

The repository has no metrics endpoint, tracing, log shipping, packaged
dashboard, or alert delivery.

## Local and production operation

`docker-compose.yml` provides loopback-bound PostgreSQL and Keycloak services
with synthetic credentials for local development. It does not build or run the
API or web applications.

The repository builds the applications with `make build` and exposes
`start:prod` for the API and `start` for the web application. It does not
provide:

- a deployment workflow;
- application container images;
- a reverse proxy or TLS termination;
- secret storage or rotation infrastructure;
- database high availability or automated rollback;
- production backup retention; or
- runtime monitoring infrastructure.

Operators must provide and verify those controls before any deployment
assessment. See [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) and
[docs/RELIABILITY.md](docs/RELIABILITY.md).
