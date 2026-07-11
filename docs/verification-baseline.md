# Local Verification Snapshot

Date: 2026-07-11

This document records the latest checks actually observed in the local checkout.
It is not a release certificate, a claim about the default branch, or evidence
that remote CI and hosted services are green.

## Verified Locally

| Area                  | Result                | Evidence                                                                                                                                             |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency graph      | Pass                  | `pnpm install --frozen-lockfile` completed with the committed lockfile.                                                                              |
| Generation            | Pass                  | `make generate` completed; a subsequent diff against committed files was empty.                                                                      |
| Fast project gate     | Pass                  | `make quick` completed: lint, typecheck, and 817 unit tests passed.                                                                                  |
| Build                 | Pass with one warning | `make build` built all packages, the NestJS API, and 32 localized Next.js route variants. Next.js reported that its ESLint plugin is not configured. |
| Formatting            | Pass                  | `make format` reported no drift.                                                                                                                     |
| Documentation         | Pass                  | `make docs-check` validated the committed Markdown links.                                                                                            |
| Schemas and fixtures  | Pass                  | `make schemas` compiled domain schemas and validated synthetic fixtures.                                                                             |
| OpenAPI               | Pass                  | `make openapi-check` matched the generated API document to the committed snapshot.                                                                   |
| Local static analysis | Pass                  | All 13 configured local analyzers completed with zero issues and zero tool errors on the permitted corpus.                                           |

Focused unit checks also covered authentication failure mapping, pinned webhook
transport, closing transitions, surcharge boundaries, CSV parsing, backup URL
handling, and schema generator stability.

## Environment-Bound Checks

The following commands were attempted but could not start their database-backed
work because PostgreSQL was unavailable at `localhost:5433`:

- `make test-integration`
- `make test-e2e`
- `make test-acceptance`
- `make test-compliance`
- `make test-backup-restore`
- `make check`
- `make test-all`

The observed failure was Prisma `P1001`. The active execution environment also
rejected Docker commands before they ran, so the local PostgreSQL service could
not be started during that verification session. Playwright reached the same
database boundary while starting its API server; no browser behavior should be
reported as verified from that run.

## Current Interpretation

- Source-level, generated-contract, unit, and build evidence is green locally.
- Database transaction, concurrency, restore, acceptance, compliance, and
  browser evidence remains partial until the service-backed gates run.
- Remote GitHub Actions, hosted dependency review, CodeQL, and Codacy Cloud were
  not verified by this local snapshot.
- Fixtures and examples are synthetic. No production data, credentials,
  governance minutes, or machine-specific paths belong in this repository.

Run `make setup` in an authorized development environment, then rerun
`make check` and `make test-all` before describing the checkout as release-ready.
