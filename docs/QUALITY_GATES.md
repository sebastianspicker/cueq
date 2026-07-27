# Quality Gates

This document separates commands enforced by the repository from useful
engineering targets. A passing local command is evidence for that command only;
it is not a production or compliance certificate.

## Enforced repository checks

| Command                          | What it checks                                                                                               | Environment                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Manifest, catalog, override, and lockfile reproducibility                                                    | Fresh local or hosted package-manager environment                |
| `make quick`                     | Lint, typecheck, and unit tests                                                                              | Local Node/pnpm workspace                                        |
| `make test-coverage`             | Non-service-backed Vitest coverage for each workspace against its configured source subset and thresholds    | Local Node/pnpm workspace                                        |
| `make knip`                      | Unused production/test files, exports, dependencies, and binaries in normal and strict production modes      | Local Node/pnpm workspace                                        |
| `make docs-check`                | Internal Markdown links                                                                                      | Local workspace                                                  |
| `make hygiene-check`             | Forbidden private, local-only, and generated tracked paths                                                   | Local workspace                                                  |
| `make schemas`                   | Domain schemas and synthetic fixture contracts                                                               | Local Node/pnpm workspace                                        |
| `make generate`                  | Prisma generation plus committed OpenAPI, database-schema, and shared-schema artifacts                       | Fresh local or hosted package-manager environment                |
| `make openapi-check`             | Generated OpenAPI against the committed snapshot                                                             | Local generated client/tooling                                   |
| `make check`                     | Hygiene, lint, format, dual-compiler verification, Knip, docs, schemas, migrations, tests, and OpenAPI drift | PostgreSQL, pinned Chromium, and the installed project toolchain |
| `make test-all`                  | Unit, integration, acceptance, compliance, policy golden, and backup/restore suites                          | PostgreSQL and applicable browser/service dependencies           |

CI additionally verifies that `make generate` leaves all three committed
artifacts unchanged, installs PostgreSQL and Playwright, runs setup and a
phase-2 seed, then runs `make check`, acceptance, accessibility, and build
jobs. Hosted CI must be checked on the exact candidate commit; it is not
implied by local results.

## Coverage gates and non-gated engineering targets

`make test-coverage` enforces workspace-specific floors:

| Workspace | Lines | Functions | Branches | Statements |
| --------- | ----: | --------: | -------: | ---------: |
| API       |   58% |       45% |      70% |        58% |
| Web       |   20% |       45% |      70% |        20% |
| Core      |   90% |       90% |      85% |        90% |
| Policy    |   85% |       75% |      80% |        85% |
| Shared    |   90% |       60% |      80% |        90% |
| Database  |  100% |      100% |     None |       100% |

The database source subset has no meaningful branch denominator, so it does not
set a branch floor. These thresholds cover configured source subsets, not every
production execution path.

The following are desirable outcomes but are not otherwise established as
repository-enforced pass/fail thresholds:

- response-time, throughput, and load targets;
- availability, recovery-time, and operational service-level objectives;
- broader coverage of currently unexercised API and UI production paths;
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
