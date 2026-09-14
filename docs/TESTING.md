# Testing cueq

Run checks from the repository root. Start with the command closest to your
change, then use the broader repository check before merging.

## Everyday checks

`make quick` is the normal feedback loop. It checks architecture rules, lint,
TypeScript, and each workspace's default Vitest suite. `make build` compiles all
shared packages and creates production builds for the API and web application.

For a complete local check, use `make check`. It expects the installed dependency
graph and a migrated PostgreSQL database seeded with the synthetic baseline. It
runs repository hygiene, architecture, lint, formatting, both TypeScript
compilers, Knip, documentation links, schemas, migrations, database and HTTP API
integration tests, default tests, coverage thresholds, the full API coverage
report, and the OpenAPI drift check.

Useful focused commands include:

| Command                                                      | Use it for                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `make docs-check`                                            | Repository-relative Markdown links                          |
| `make hygiene-check`                                         | Files that must not be tracked                              |
| `make knip`                                                  | Unused files, exports, dependencies, and binaries           |
| `make schemas`                                               | JSON Schema validation and examples                         |
| `make openapi-check`                                         | Comparing generated OpenAPI with the committed snapshot     |
| `./scripts/pnpm.sh test:coverage`                            | Workspace coverage thresholds                               |
| `./scripts/pnpm.sh --filter @cueq/database test:integration` | Database and audit invariants                               |
| `./scripts/pnpm.sh --filter @cueq/api test:integration`      | HTTP reads and authorization against the synthetic baseline |

`make generate` refreshes Prisma and committed generated files; it is a write
operation, not a check. CI runs it and rejects an unexpected diff.

## Where tests live

- Shared contracts, policy, and domain tests are co-located under
  `packages/*/src`.
- API service, adapter, security, and controller tests are under
  `apps/api/src`.
- API composition and OpenAPI tests are in `apps/api/test/architecture`; real
  listener tests are in `apps/api/test/integration`.
- Database integration tests are in `packages/database/test/integration` and
  use their own Vitest configuration.
- Web tests cover selected platform and component behavior under `apps/web/src`.
  The repository does not contain a browser end-to-end suite.

Contracts, policy, and domain packages leave files named
`*.integration.test.ts`, `*.acceptance.test.ts`, and `*.compliance.test.ts` out
of their default run. Include those co-located tests with:

```bash
CUEQ_INCLUDE_SPECIALIZED_TESTS=1 ./scripts/pnpm.sh test
```

This flag does not start services or add browser coverage. Each test still needs
the environment used by its implementation.

## Run the PostgreSQL suites

Use a dedicated, disposable database in `DATABASE_URL`. Apply migrations and
seed the baseline before the API integration suite:

```bash
./scripts/pnpm.sh --filter @cueq/database db:migrate:deploy
./scripts/pnpm.sh --filter @cueq/database db:seed:baseline
./scripts/pnpm.sh --filter @cueq/database test:integration
./scripts/pnpm.sh --filter @cueq/api test:integration
```

The API suite starts the complete NestJS application on a real HTTP listener. It
makes read-only requests against the synthetic baseline and checks mock-token
authentication, including an employee-role denial. Do not point either suite at
a database whose contents must be retained.

Database tests also exercise webhook job generation fencing and single-count
item finalization. Unit tests cannot establish recovery across process restarts
or competing workers.

## Check documentation changes

For a documentation-only change, run:

```bash
./scripts/pnpm.sh exec prettier --check README.md docs/TESTING.md
make docs-check
git diff --check
```

Replace the example file names with the Markdown files you changed. Keeping the
list explicit avoids checking ignored or local notes outside the contribution.
The link checker validates local file targets in tracked and non-ignored
Markdown. It does not fetch external URLs or validate heading fragments.

## CI

GitHub Actions uses Node.js 22.13.0, pnpm 11.24.0, and PostgreSQL 16. It checks
generated artifacts, audits production dependencies, seeds the baseline, runs
`make check`, and builds the monorepo. A second job repeats setup and the full
check from a fresh clone. Pull requests also run Dependency Review, and CodeQL
analyzes JavaScript and TypeScript.

Changes limited to the README or Pages demo use the smaller Pages path, which
builds and verifies the static demo. Always inspect hosted results on the commit
you intend to merge or release.

## Tests that need another environment

PostgreSQL behavior needs a real database run. Visible layout, keyboard,
responsive, and accessibility behavior needs a browser connected to the web app
and API. OIDC, SAML, terminal, HR, payroll, webhook, and deployment behavior
needs the relevant external system. Report these checks as unrun when the needed
environment was unavailable.

The reproducible roster workload checks output parity; timing is measured
separately from CI assertions. Dashboard tests cover Berlin DST midnights and
keep count and list queries in one repeatable-read snapshot.
