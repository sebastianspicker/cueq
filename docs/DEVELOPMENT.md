# Local development

This guide gets cueq running locally with synthetic data. For production-facing
settings, see [Configuration](CONFIGURATION.md) and [Operations](OPERATIONS.md).

## What you need

- Node.js 22.13 or later. The repository and CI currently use 22.13.0.
- pnpm 11.24.0. `./scripts/pnpm.sh` resolves the pinned version for you.
- Docker with Compose
- GNU Make
- OpenSSL, used to create a local webhook encryption key

Run all commands from the repository root.

## First-time setup

Create a local environment file and generate a webhook key:

```bash
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `WEBHOOK_SECRET_ENCRYPTION_KEY` in `.env`. Leave
`AUTH_PROVIDER=mock` for local use. The populated file is ignored by Git and
must stay out of commits.

Then install dependencies, start PostgreSQL, generate Prisma, and apply the
committed migrations:

```bash
make setup
./scripts/pnpm.sh --filter @cueq/database db:seed:demo
```

`make setup` does not delete an existing local volume. If Docker cannot start,
the script continues with the configured `DATABASE_URL`, but that database must
be reachable for migration deployment to succeed. Use `SKIP_DOCKER=1 make setup`
when PostgreSQL is already running, or `SKIP_INSTALL=1 make setup` after a
separate frozen install.

## Start cueq

```bash
make dev
```

The command loads `.env` with Node's environment-file parser and starts:

- the web application at <http://localhost:3000>;
- the API at <http://localhost:3001>; and
- Swagger UI at <http://localhost:3001/api/docs> outside production.

Set `CUEQ_ENV_FILE` to use another readable environment file. Open
<http://localhost:3000/de/settings> and leave the API base URL at `/api` to use
the development rewrite.

The browser keeps its token in memory, so a reload clears it. The demo seed
provides these local tokens:

| Token            | Role            |
| ---------------- | --------------- |
| `employee-token` | Employee        |
| `lead-token`     | Team lead       |
| `planner-token`  | Shift planner   |
| `hr-token`       | Human resources |
| `admin-token`    | Administrator   |

Mock authentication is for a trusted development machine. Do not expose the API
to an untrusted network while it is enabled.

## Work in one package

Root commands are the normal choice because Turbo runs dependencies in the
right order. During focused work, you can call one workspace directly:

```bash
./scripts/pnpm.sh --filter @cueq/api test
./scripts/pnpm.sh --filter @cueq/web typecheck
./scripts/pnpm.sh --filter @cueq/domain test
./scripts/pnpm.sh --filter @cueq/database test:integration
```

The database integration suite needs a migrated, disposable PostgreSQL database.
[Testing](TESTING.md) describes the complete checks and their prerequisites.

## Regenerate contracts

Changes to Prisma, JSON Schema, Zod or HTTP contracts, and Swagger decorators may
change committed generated files. Refresh and check them with:

```bash
make generate
make schemas
make openapi-check
```

Review the resulting diff. Change the source rather than editing these files by
hand:

- `contracts/openapi/openapi.json`
- `docs/generated/db-schema.md`
- `packages/domain/src/generated/schema-contracts.ts`

## Stop or reset the local environment

Stop the applications with `Ctrl-C`, then stop PostgreSQL while keeping its
data:

```bash
docker compose down
```

`make clean` removes build and tool output. Deleting the Compose volume requires
the explicit command in [Operations](OPERATIONS.md); check the database and
Compose project before using it.

Repository examples, screenshots, exports, issues, and logs must contain only
synthetic data. If real personal data, credentials, private governance records,
or production logs appear during development, stop and remove them from the
working material before continuing.

## API conventions

Paginated collection endpoints return `{items,nextCursor}`. The default page
size is 50 and the maximum is 100. Pass a non-null `nextCursor` back as `cursor`;
invalid cursors return HTTP 400. Endpoint-specific filters and interval rules are
in the generated OpenAPI document.

The legacy HR import CLI uses the compiled database workspace. After Prisma
generation, build that workspace before running the importer:

```bash
./scripts/pnpm.sh --filter @cueq/database build
node scripts/hr-import.mjs --file /absolute/path/to/synthetic-people.csv
```

The importer preserves existing appointment terms and personnel-owned fields.
Employment changes require explicit dated reconciliation.
