# Local Verification Snapshot

Date: 2026-07-11

This document records the latest checks actually observed in the local checkout.
It includes a broad same-day baseline plus a focused refresh after the latest
local source edits. It is not a release certificate, a claim about the default
branch, or evidence that remote CI and hosted services are green.

## Verified Locally

| Area                  | Result                | Evidence                                                                                                                                               |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency graph      | Earlier same-day pass | `pnpm install --frozen-lockfile` completed with the committed lockfile.                                                                                |
| Lint                  | Current pass          | `pnpm lint` completed all 10 Turbo tasks across the six workspaces.                                                                                    |
| Typecheck             | Current pass          | The installed TypeScript binary checked each of the six workspace `tsconfig.json` files with `--noEmit`.                                               |
| Unit tests            | Current pass          | Fresh workspace-local Vitest runs passed 821 tests across API, web, core, database, policy, and shared.                                                |
| Documentation         | Current pass          | `node ./scripts/check-doc-links.mjs` validated all 44 committed Markdown files.                                                                        |
| Generation            | Earlier same-day pass | `make generate` completed; a subsequent diff against committed files was empty.                                                                        |
| Build                 | Earlier pass, warning | `make build` built all packages, the NestJS API, and 32 localized Next.js route variants. Next.js reported that its ESLint plugin is not configured.   |
| Formatting            | Earlier same-day pass | `make format` reported no drift.                                                                                                                       |
| Schemas and fixtures  | Current pass          | `make schemas` compiled domain schemas and validated synthetic fixtures.                                                                               |
| OpenAPI               | Earlier same-day pass | `make openapi-check` matched the generated API document to the committed snapshot.                                                                     |
| Local static analysis | Current partial       | All 13 tool statuses succeeded with zero issues; the exact final run recorded four Semgrep per-file timeout warnings, reproduced by an isolated rerun. |
| Repository hygiene    | Current pass          | ShellCheck, isolated hygiene regressions, `make hygiene-check`, and explicit ignore-rule probes passed; no tracked private artifacts were found.       |

Focused unit checks also covered authentication failure mapping, pinned webhook
transport, closing transitions, surcharge boundaries, CSV parsing, backup URL
handling, and schema generator stability.

Make-based commands were also attempted during the focused refresh. Some package
tasks ran, but pnpm release-signature verification stalled before or between
other tasks, so complete Make-gate results are not claimed. The direct installed
workspace binaries above separate that environment/network behavior from source
results.

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

- Lint, typecheck, unit, and documentation-link evidence is current and green
  for the local checkout.
- Schema evidence is current. Build, formatting, and generated-contract evidence
  remains from the earlier same-day baseline. Current filesystem static analysis
  is issue-clean but contains analyzer timeout warnings; it is not error-clean
  committed-head evidence.
- Database transaction, concurrency, restore, acceptance, compliance, and
  browser evidence remains partial until the service-backed gates run.
- Remote GitHub Actions, hosted dependency review, CodeQL, and Codacy Cloud were
  not verified by this local snapshot.
- Fixtures and examples are synthetic. No production data, credentials,
  governance minutes, or machine-specific paths belong in this repository.

Run `make setup` in an authorized development environment, then rerun
`make check` and `make test-all` before describing the checkout as release-ready.
