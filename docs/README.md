# Documentation

The root [README](../README.md) is the entry point for installation, local use,
repository structure, testing, and operational limits.

## Runtime and development

- [Architecture](../ARCHITECTURE.md): applications, packages, contracts, data
  flow, and deployment boundary
- [Configuration](CONFIGURATION.md): environment variables, defaults, and
  production requirements
- [Frontend](FRONTEND.md): routes, shared UI structure, localization, and
  browser data flow
- [Engineering design](DESIGN.md): domain boundaries, patterns, errors, and
  testing layers
- [Brand](BRAND.md): current product name, visual vocabulary, and asset rules
- [Quality gates](QUALITY_GATES.md): local and CI validation commands
- [Operations runbook](OPERATIONS_RUNBOOK.md): migrations, health checks,
  integration maintenance, and backup verification
- [Reliability](RELIABILITY.md): runtime dependencies and recovery boundaries
- [Security design](SECURITY.md): authentication, authorization, privacy, and
  threat boundaries

## Evaluation and release

- [Alpha evaluation](ALPHA.md): synthetic-data setup and mock-token walkthrough
- [Release process](RELEASING.md): source-alpha tag checks and publication
  sequence
- [Release status](../RELEASE_STATUS.md): current candidate state and evidence
  requirements
- [Roadmap](ROADMAP.md): work required before a production assessment
- [Screenshot verification](assets/screenshots/README.md): capture commands,
  expected files, and publication review

## Design and product behavior

- [Design documents](design-docs/index.md): cross-cutting engineering rules
- [Architecture decisions](design-decisions/index.md): accepted technical
  decisions and their current status
- [Product specifications](product-specs/index.md): implemented capability
  boundaries and source entry points
- [Domain schema index](generated/db-schema.md): entity contracts derived from
  the domain JSON Schemas

When documentation conflicts with executable configuration or source, treat the
source, tests, schema, and committed public contracts as authoritative and
update the documentation in the same change.
