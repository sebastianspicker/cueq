# cueq

cueq is a TypeScript modular monolith for workforce time recording, absences,
rosters, workflows, monthly closing, reporting, integrations, and audit
records in a German university context. It is source-alpha software for local
evaluation with synthetic data, not a hosted or approved institutional system.

## Architecture

- `apps/web`: Next.js 15 interface. Locale routes are feature-owned under
  `src/app/[locale]`; browser API transport lives in `src/platform/http`.
- `apps/api`: NestJS API. Platform auth, HTTP, validation, persistence, and
  transaction utilities support feature modules in `src/modules`.
- `packages/contracts`: Zod API and event DTOs, depending only on Zod.
- `packages/policy`: versioned policy data, depending only on Zod.
- `packages/domain`: pure calculations and state machines, depending on policy.
- `packages/database`: Prisma client, schema, migrations, and database tools.

The API feature modules are `audit`, `people`, `session`, `attendance`,
`absence`, `scheduling`, `workflows`, `closing`, `policy`, `reporting`, and
`integrations`. Feature internals are private and cross-feature imports use
explicit `public.ts` surfaces. Mutations of another feature's aggregates use
narrow application ports; workflows and closing orchestrate those ports while
reporting and integrations adapt external boundaries.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the dependency direction and
[docs/README.md](docs/README.md) for operational documentation.

## Local evaluation

Requirements: Node 22.13+, pnpm 11.24, Docker Compose, and GNU Make.

The local Compose file provides PostgreSQL only at `localhost:5433`. Local
evaluation uses mock authentication; it does not start or configure an OIDC
issuer, realm, client, or users. OIDC requires a separately configured issuer
and explicit `AUTH_PROVIDER=oidc`, `OIDC_ISSUER_URL`, and `OIDC_CLIENT_ID`
settings.

```bash
cp .env.example .env
openssl rand -base64 32
# Set the generated value as WEBHOOK_SECRET_ENCRYPTION_KEY in .env.
make setup
pnpm --filter @cueq/database db:seed:demo
make dev
```

Open `http://localhost:3000/de/settings`. The API runs on port 3001 by default;
non-production OpenAPI UI is at `http://localhost:3001/api/docs`. Local mock
authentication and seed data are evaluation-only. Do not use real employee,
payroll, health, credential, or operational data.

## Verification

```bash
make quick
make docs-check
make schemas
make openapi-check
make build
```

`make check` is the broader composite gate and requires its database and
toolchain prerequisites. Browser, external identity-provider, terminal, HR,
payroll, deployment, and production-operation lanes are not proven by these
local commands. Report an unavailable database or browser lane as unavailable,
not passing.

## Operational limits

The repository supplies source code, migrations, local Compose configuration,
and validation tooling. It does not supply production deployment, TLS, secret
storage, backup retention, monitoring, alerting, SSO administration, or
external-provider certification. Consult [docs/ALPHA.md](docs/ALPHA.md),
[docs/CONFIGURATION.md](docs/CONFIGURATION.md), and
[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) before evaluating a
runtime.
