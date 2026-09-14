# ADR-002: Keep deployment infrastructure outside the repository

- Status: Accepted
- Scope: Application deployment

## Context

The web and API need PostgreSQL, runtime secrets, identity-provider
configuration, deployed migrations, browser access, and process supervision.
The repository provides source builds, health endpoints, maintenance commands,
and a loopback-bound Compose service for local PostgreSQL. It does not select a
production environment or identify who will operate one.

Choosing a cloud, container platform, scaling model, availability design, or
release mechanism without those constraints would describe a topology that does
not exist in the project.

## Decision

Keep production deployment infrastructure outside this repository until a
target environment and responsible operator are selected.

A deployment must run the web and API processes from one reviewed revision and
provide PostgreSQL migration and recovery controls, TLS, secret injection,
production identity configuration, explicit CORS and network policy, process
supervision, logging, monitoring, alerts, rollback, and the required
organizational reviews.

The static GitHub Pages demo is not an application deployment.

## Consequences

- `docker-compose.yml` remains a loopback-bound local PostgreSQL service.
- CI checks the source and Pages demo but does not publish application images or
  packages.
- `start:prod` and `next start` are process entry points, not a
  deployment system.
- Capacity, availability, hosting location, recovery, and rollout remain the
  operator's decisions.

## References

- [Architecture](../../ARCHITECTURE.md)
- [Configuration](../CONFIGURATION.md)
- [Operations](../OPERATIONS.md)
- [Security](../SECURITY.md)
