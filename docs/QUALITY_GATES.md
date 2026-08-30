# Quality Gates

This document separates commands enforced by the repository from useful
engineering targets. A passing local command is evidence for that command only;
it is not a production or compliance certificate.

## Enforced repository checks

| Command                                         | What it checks                                                                                                      | Environment                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm install --frozen-lockfile`                | Manifest, catalog, override, and lockfile reproducibility                                                           | Fresh local or hosted package-manager environment |
| `make quick`                                    | Lint, typecheck, and direct contract tests                                                                          | Local Node/pnpm workspace                         |
| `pnpm architecture:check`                       | Package direction, workspace cycles, retired paths, and API public-surface imports                                  | Local Node/pnpm workspace                         |
| `pnpm test:coverage`                            | Thresholded domain, contract, policy, and database-free web/API boundary coverage                                   | Local Node/pnpm workspace                         |
| `pnpm --filter @cueq/api test:coverage:all`     | Informational full API coverage and its PostgreSQL-backed orchestration gap                                         | Local Node/pnpm workspace                         |
| `pnpm --filter @cueq/database test:integration` | PostgreSQL uniqueness and append-only audit invariants                                                              | Migrated disposable PostgreSQL                    |
| `make knip`                                     | Unused production/test files, exports, dependencies, and binaries in normal and strict production modes             | Local Node/pnpm workspace                         |
| `make docs-check`                               | Internal Markdown links                                                                                             | Local workspace                                   |
| `make hygiene-check`                            | Forbidden private, local-only, and generated tracked paths                                                          | Local workspace                                   |
| `make schemas`                                  | Domain schemas                                                                                                      | Local Node/pnpm workspace                         |
| `make generate`                                 | Prisma generation plus committed OpenAPI, database-schema, and shared-schema artifacts                              | Fresh local or hosted package-manager environment |
| `make openapi-check`                            | Generated OpenAPI against the committed snapshot                                                                    | Local generated client/tooling                    |
| `make check`                                    | Hygiene, lint, format, dual-compiler verification, Knip, docs, schemas, migrations, direct tests, and OpenAPI drift | PostgreSQL and the installed project toolchain    |

CI additionally verifies that `make generate` leaves all three committed
artifacts unchanged, runs setup and the configured checks. Hosted CI must be
checked on the exact candidate commit; it is not implied by local results.

## Non-gated engineering targets

The following are desirable outcomes but are not established as repository
pass/fail thresholds:

- response-time, throughput, and load targets;
- availability, recovery-time, and operational service-level objectives;
- broader coverage of PostgreSQL-backed API orchestration and UI production paths;
- production accessibility conformance;
- production security, privacy, legal, and works-council approval; and
- successful behavior with institutional identity, payroll, and terminal
  systems.

Treat these as assessment work requiring explicit measurement and owner review,
not as claims supplied by source code or test names.

## Using gate evidence

Run the narrowest relevant command after a change, then the broadest practical
gate. Report unavailable checks with the exact environment boundary (for
example, unavailable PostgreSQL or browser dependencies). For a production
assessment, use the sequence in [ROADMAP.md](ROADMAP.md) and the current
[release status](../RELEASE_STATUS.md). Public source-alpha preparation follows
the stricter [release process](RELEASING.md).
