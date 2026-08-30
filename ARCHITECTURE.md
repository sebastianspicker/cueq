# Architecture

cueq is a TypeScript modular monolith for workforce operations. It runs a
Next.js web application, a NestJS API, and PostgreSQL accessed through Prisma.
The API is the authorization and transaction boundary; the web UI is a
localized client, not a security boundary.

## Runtime composition

| Component      | Entry point                              | Responsibility                                                                  |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Web            | `apps/web/src/app/[locale]/`             | Locale-owned Next.js routes and feature UI                                      |
| API            | `apps/api/src/main.ts`                   | Nest bootstrap, HTTP policy, OpenAPI in non-production, and feature composition |
| Database       | `packages/database/prisma/schema.prisma` | Prisma schema, migrations, and PostgreSQL client                                |
| Scheduled work | API feature modules                      | Closing cutoff, workflow escalation, and webhook dispatch in the API process    |

The web server rewrites `/api/*` to the local API during development. Browser
requests use `apps/web/src/platform/http`; feature route code stays next to its
locale route. The API applies authentication, role checks, validation, error
filters, CORS, and transactions before feature logic reaches persistence.

## Module boundaries

`apps/api/src/app.module.ts` is composition only. Authentication and HTTP
policy live in `apps/api/src/platform/`; Prisma lifecycle integration lives in
`apps/api/src/persistence/`. Protocol-specific CSV, webhook, terminal, and HR
adapters remain owned by `modules/integrations`.
Operational features live under `apps/api/src/modules/`:

```text
audit        people       session       attendance
absence      scheduling   workflows     closing
policy       reporting    integrations
```

Each feature owns its controllers, application services, and internal helpers.
Do not import another feature's internals: deliberate shared services are
exported from `public.ts`. Mutations of another feature's aggregates cross an
application port and are implemented by the owning feature. `workflows` and
`closing` orchestrate those ports; `reporting` and `integrations` adapt
outward-facing boundaries such as reports, webhooks, terminal input, and HR
providers.

Workflow runtime is a narrower boundary than workflow decisions. Absence and
closing import `modules/workflows/workflow-runtime.public.ts` to create and
inspect workflow state. Decision transitions remain in `WorkflowsModule`, where
they orchestrate feature-owned effects. This split keeps the Nest module graph
acyclic without `forwardRef`.

## Package DAG

```text
contracts ──> zod
policy ─────> zod
domain ─────> policy
database ───> Prisma/PostgreSQL
web ────────> contracts
api ────────> contracts, domain, policy, database
```

`@cueq/contracts` provides Zod API and event DTOs and depends only on Zod.
`@cueq/policy` provides versioned rule data and also depends only on Zod.
`@cueq/domain` provides pure calculations and state machines and depends only
on policy within the workspace. `@cueq/database` owns Prisma schema, client,
migrations, and database scripts. Domain code must not import NestJS, Prisma,
HTTP, browser, filesystem, or process-specific code.

## Public contracts and persistence

Nest controllers define the HTTP surface; the committed OpenAPI snapshot is
`contracts/openapi/openapi.json`. Zod contracts are exported from
`packages/contracts`. Prisma storage definitions and committed migrations live
in `packages/database/prisma/`. Run `make generate` after changing a source
contract or Prisma schema, then review generated output. Do not hand-edit the
OpenAPI or generated database documentation.

Related writes use Prisma transactions. Audit records and selected outbox
events are written with their domain changes where implemented. The audit table
has mutation resistance from its migration, not cryptographic-ledger
guarantees; privileged database access remains outside this protection.

## Operations and limits

The API exposes `/health`, `/health/ready`, and terminal health routes. The
non-production Swagger UI is mounted at `/api/docs`; it is not served in
production. Local Compose supplies development PostgreSQL only; OIDC uses an
operator-configured external issuer.
The repository does not provide application deployment, TLS termination,
secret management, production backup retention, monitoring, alert delivery, or
external-provider acceptance. See [Configuration](docs/CONFIGURATION.md), the
[operations runbook](docs/OPERATIONS_RUNBOOK.md), and
[reliability limits](docs/RELIABILITY.md).
