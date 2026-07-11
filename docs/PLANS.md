# PLANS.md - Current Implementation Status

This document is the public status summary for cueq. Historical execution
plans, prior audits, and release-candidate notes are not part of the committed
public documentation surface.

## Current Status

cueq is a proof of concept and reference implementation for university
workforce management under TV-L / NRW constraints. The repository contains the
implemented Phase 0-3 scope:

| Phase   | Scope                                                                                    | Status   |
| ------- | ---------------------------------------------------------------------------------------- | -------- |
| Phase 0 | Harness foundation: CI, schemas, config, scripts, docs skeleton                          | Complete |
| Phase 1 | Domain core: time, absence, workflow, roster, closing, audit                             | Complete |
| Phase 2 | Services and UI: API, adapters, frontend flows, acceptance tests                         | Complete |
| Phase 3 | Integrations and operations: terminal gateway, HR import, payroll/export, backup/restore | Complete |

Release readiness is verified by the repository gates, not by this status file.
Before publishing a release candidate, run `make check` locally and confirm the
GitHub Actions workflow is green on the default branch.

One-off agent remediation plans, ledgers, and status scratchpads are not part of
the live project documentation. Keep them out of the committed tree; use this
file, the product specs, and the standard verification commands for current
status.

## Active Release Gates

- `make check` passes on a fresh clone.
- GitHub Actions runs on `main` for pushes and pull requests.
- `contracts/openapi/openapi.json` is committed and matches the generated API.
- Generated contract artifacts are refreshed with `make generate` when schemas
  or API decorators change.
- Documentation links pass with `make docs-check`.
- No secrets, PII, telemetry, local caches, or machine-specific paths are
  committed.

## References

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) - System architecture
- [`DESIGN.md`](DESIGN.md) - Design principles and implementation patterns
- [`SECURITY.md`](SECURITY.md) - Threat model, RBAC, GDPR constraints
- [`RELIABILITY.md`](RELIABILITY.md) - Operations, backups, monitoring
- [`product-specs/index.md`](product-specs/index.md) - Product specifications
