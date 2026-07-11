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

- `make quick`, `make build`, `make format`, `make docs-check`, `make schemas`,
  `make generate`, and `make openapi-check` passed locally.
- The local 13-tool static-analysis corpus completed with zero findings and zero
  tool errors.
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

## References

- [`../PRODUCT.md`](../PRODUCT.md) - Product and role model
- [`../DESIGN.md`](../DESIGN.md) - Trusted Operations Desk visual system
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) - System architecture
- [`FRONTEND.md`](FRONTEND.md) - Current frontend structure
- [`SECURITY.md`](SECURITY.md) - Threat model, authorization, and privacy design
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) - Local operational procedures
- [`product-specs/index.md`](product-specs/index.md) - Capability specifications
