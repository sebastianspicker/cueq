# Contributing

cueq is source-alpha software for synthetic local evaluation. Keep changes
reviewable and never add real personal data, secrets, telemetry, or unapproved
production dependencies.

## Before changing code

- Read affected source, contracts, migrations, and existing tests.
- Preserve package dependency direction: contracts and policy are leaf
  packages; domain is pure and depends only on policy; API and web sit at the
  edges; database owns Prisma.
- Keep API feature internals private and import another feature only through
  its `public.ts`. Use narrow ports for cross-feature aggregate mutation,
  especially around workflows and closing.
- Do not hand-edit generated OpenAPI or database documentation.

## Local setup

```bash
cp .env.example .env
openssl rand -base64 32
# Set WEBHOOK_SECRET_ENCRYPTION_KEY in .env.
make setup
pnpm --filter @cueq/database db:seed:demo
```

The local database is disposable. Read [docs/ALPHA.md](docs/ALPHA.md) before
running setup, reset, cleanup, or database commands against anything you need
to retain.

## Verification

Run the narrowest relevant command while editing, then the broadest practical
gate:

```bash
make quick
make docs-check
make schemas
make openapi-check
make build
```

`make check` needs PostgreSQL and the installed project toolchain. Add focused
tests for changed behavior, including invalid input and role boundaries where
appropriate. Database-backed transaction, migration, and concurrency behavior
needs a real PostgreSQL lane; visible browser behavior needs a browser lane.
Do not claim either lane passed when it was not run.

## Contracts, documentation, and pull requests

For API, contract, or Prisma changes, run `make generate`, `make schemas`, and
`make openapi-check`; review derived artifacts rather than editing them by
hand. Update documentation whenever paths, commands, environment variables,
routes, or behavior change.

Pull requests should explain the behavior or contract change, affected modules
and artifacts, checks run, unavailable checks, and remaining uncertainty.
