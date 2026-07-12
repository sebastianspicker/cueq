# Documentation

The public documentation describes the current source tree, its intended
contracts, and its verification boundaries. It intentionally excludes private
governance records, production data, internal tickets, remediation ledgers, and
machine-specific evidence.

## Start Here

| Document                                               | Purpose                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| [`../README.md`](../README.md)                         | Product overview, setup, commands, and repository map      |
| [`../PRODUCT.md`](../PRODUCT.md)                       | Users, product purpose, privacy principles, and role model |
| [`../DESIGN.md`](../DESIGN.md)                         | Trusted Operations Desk visual language and tokens         |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md)             | System boundaries and dependency direction                 |
| [`PLANS.md`](PLANS.md)                                 | Current implementation and release-verification status     |
| [`verification-baseline.md`](verification-baseline.md) | Latest observed local checks and explicit gaps             |

## Engineering and Operations

- [`FRONTEND.md`](FRONTEND.md) - Web routes, session model, i18n, and UI rules
- [`DESIGN.md`](DESIGN.md) - Domain and application design patterns
- [`SECURITY.md`](SECURITY.md) - Authentication, authorization, privacy, and threat model
- [`RELIABILITY.md`](RELIABILITY.md) - Availability, backup, monitoring, and recovery targets
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) - Local integration and operational procedures
- [`QUALITY_SCORE.md`](QUALITY_SCORE.md) - Quality targets and their enforcing commands
- [`product-specs/index.md`](product-specs/index.md) - Capability specifications
- [`design-decisions/index.md`](design-decisions/index.md) - Architecture decisions
- [`design-docs/index.md`](design-docs/index.md) - Durable design rationale

## Public/Private Boundary

Keep only synthetic examples and durable public guidance in Git. The following
remain local or in the institution's approved private systems:

- environment files and credentials;
- real employee or operational data;
- works-council minutes, reviewer identities, and internal decision records;
- audit/remediation packets, status scratchpads, and agent notes;
- local analyzer output, browser traces, database dumps, and generated demo
  screenshots;
- payroll/report exports, office documents, mail or calendar archives, and
  packaged local handoff artifacts;
- personal assistant/orchestrator configuration and caches, including
  `.agents/`, `.codex/`, `.codegraph/`, `.serena/`, and `openclaw.json`.

Run `make hygiene-check` before publishing to reject forbidden tracked paths.
Use `make docs-check` after documentation changes.
