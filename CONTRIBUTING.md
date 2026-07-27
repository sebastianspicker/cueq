# Contributing

cueq is a source alpha for workforce workflows that can contain sensitive data.
Use synthetic fixtures and keep every change reviewable.

## Before changing code

- Read the affected source, tests, schemas, migrations, and public contracts.
- Confirm the current behavior with the narrowest available test or
  reproduction.
- Keep the change focused on one behavior or documentation concern.
- Do not add secrets, real personal data, telemetry, or production dependencies.
- Discuss new production dependencies with the maintainer before adding them.

## Local setup

```bash
cp .env.example .env
make setup
./scripts/pnpm.sh --filter @cueq/database db:seed:phase2
```

Set a local `WEBHOOK_SECRET_ENCRYPTION_KEY` before starting the API. Setup and
reset commands treat the local Compose database as disposable. Read
[docs/ALPHA.md](docs/ALPHA.md) before using an existing local database.

## Development workflow

Run a focused workspace test while editing, then:

```bash
make quick
```

Before submitting a broad change, run the applicable repository checks:

```bash
make docs-check
make schemas
make openapi-check
make build
```

`make check` is the full ordered gate and requires PostgreSQL. Browser checks
require the Playwright Chromium revision. See
[docs/QUALITY_GATES.md](docs/QUALITY_GATES.md).

## Contracts and migrations

For an API, JSON Schema, shared contract, or Prisma change:

```bash
make generate
make schemas
make openapi-check
```

Review all derived artifacts. Do not hand-edit
`contracts/openapi/openapi.json`, `docs/generated/db-schema.md`, or
`packages/shared/src/generated/core-schema-types.ts` as a substitute for
changing their source.

Commit a Prisma migration for storage changes. `make db-push` is for
development and does not replace migration review.

## Tests

- Add a focused test for changed behavior.
- Test the reason the behavior matters, including invalid input and role
  boundaries where applicable.
- Use PostgreSQL-backed tests for transaction, constraint, migration, and
  concurrency behavior.
- Use browser tests for visible workflows, role visibility, loading, empty,
  error, and keyboard states.
- Do not describe an unavailable service-backed check as passed.

## Documentation

Update documentation when a command, path, environment variable, route,
contract, operational boundary, or user-visible behavior changes.

- Keep the root README usable as the GitHub entry point.
- Add detailed runtime guidance to the appropriate maintained document under
  `docs/`.
- Update product specifications when behavior or entry points change.
- Run `make docs-check` and `make format`.
- Do not preserve outdated instructions as historical sections.

## Pull requests

A pull request should:

- explain the user-visible or contract-level reason for the change;
- identify affected source, schemas, migrations, and public contracts;
- list commands run and their results;
- name checks that were unavailable and why;
- describe remaining uncertainty;
- contain only intended files; and
- use a Conventional Commit-style title such as
  `fix(api): reject invalid booking ranges`.

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use [SUPPORT.md](SUPPORT.md)
for setup questions and [SECURITY.md](SECURITY.md) for private vulnerability
reporting.
