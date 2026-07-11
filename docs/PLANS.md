# Current Implementation Status

This is the public status summary for the code present in the repository.
Historical execution plans, remediation ledgers, audit packets, and private
governance records are deliberately excluded from the committed documentation.

## Implemented Scope

cueq is a proof of concept and reference implementation for university
workforce management under TV-L and North Rhine-Westphalia constraints. The
local source tree contains the Phase 0-3 capability families:

| Capability family           | Present in the local source tree                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Harness and contracts       | Workspace scripts, CI definitions, JSON Schemas, generated types, and committed OpenAPI                    |
| Domain rules                | Time, absence, workflow, roster, closing, surcharge, and append-only audit rules                           |
| Application services        | NestJS APIs, role-aware Next.js routes, authentication adapters, reporting, and policy administration      |
| Integrations and operations | Terminal ingestion, HR import, webhooks, payroll export, backfills, seeds, and backup/restore verification |

“Present” describes implemented source and tests. It does not mean that every
deployment, legal interpretation, external provider, or release gate has been
certified for production use.

## Latest Local Verification

As of 2026-07-11:

- Direct ESLint and TypeScript checks passed across all six workspaces. Fresh
  workspace-local Vitest runs passed 821 tests on the current checkout.
  Documentation link validation also passed for all 44 committed Markdown files.
- `make schemas` passed on the current checkout. The earlier same-day baseline
  also passed `make build`, `make format`, `make generate`, and
  `make openapi-check`; complete terminal results for those broader gates were
  not obtained after the latest source edits.
- The Make-based pnpm wrapper is currently unreliable because its pnpm
  release-signature verification can stall before or between package tasks.
- A fresh strict 13-tool local analysis of an explicit 494-file current-worktree
  manifest completed with every tool status successful and zero issues. The
  exact final run recorded four Semgrep per-file timeout warnings; an isolated
  Semgrep rerun remained issue-free but reproduced timeout instability. This is
  filesystem proof, not error-clean committed-head evidence.
- Repository hygiene checks passed after expanding the public/private boundary
  for local tooling, caches, build output, office exports, mail/calendar data,
  archives, databases, and private reports. No tracked private data or secrets
  were found in the current public corpus.
- PostgreSQL-backed integration, acceptance, compliance, browser, and
  backup/restore gates were attempted but blocked by an unavailable local
  database service.
- Remote CI and hosted analysis were not verified from this checkout.

See [`verification-baseline.md`](verification-baseline.md) for exact boundaries.

## Release Gates

Before publishing or deploying a release candidate:

1. Run `make setup` in an authorized environment with PostgreSQL and Playwright.
2. Run `make check` and `make test-all` from the candidate commit.
3. Confirm generated files remain unchanged after `make generate`.
4. Confirm GitHub Actions and required hosted security checks pass on that exact
   commit.
5. Complete institution-specific legal, data-protection, security, and
   works-council review outside this public repository.
6. Run `make hygiene-check` and confirm that only intentional public files are
   tracked.

## References

- [`../PRODUCT.md`](../PRODUCT.md) - Product and role model
- [`../DESIGN.md`](../DESIGN.md) - Trusted Operations Desk visual system
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) - System architecture
- [`FRONTEND.md`](FRONTEND.md) - Current frontend structure
- [`SECURITY.md`](SECURITY.md) - Threat model, authorization, and privacy design
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) - Local operational procedures
- [`product-specs/index.md`](product-specs/index.md) - Capability specifications
