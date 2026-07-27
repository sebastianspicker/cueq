# ADR-002: Deployment boundary

- Status: Accepted boundary; deployment implementation is not present
- Scope: Production assessment

## Context

The applications require PostgreSQL, runtime secrets, identity-provider
configuration, browser access, migration deployment, and process supervision.
The repository currently provides source builds and a local Compose file only.

## Decision

Keep deployment infrastructure outside the source-alpha repository until a
specific operating environment and responsible owner are selected.

Any deployment must provide:

- separate web and API processes built from one reviewed revision;
- PostgreSQL with migration, backup, restore, and least-privilege controls;
- reverse proxy and TLS termination;
- secret injection and rotation;
- OIDC or SAML-bridge configuration;
- explicit CORS and network policies;
- process supervision, health checks, rollback, logs, monitoring, and alerts;
  and
- institutional security, privacy, accessibility, and operations review.

The repository must not imply a Kubernetes, cloud, high-availability, scaling,
or rollout topology that has not been implemented and measured.

## Consequences

- `docker-compose.yml` remains a local development definition.
- CI validates source but does not publish deployable application artifacts.
- `start:prod` and `next start` are process entry points, not a deployment
  system.
- Capacity, availability, recovery, and hosting location remain operator
  decisions.

## References

- [README deployment section](../../README.md#deployment-and-operation)
- [Operations runbook](../OPERATIONS_RUNBOOK.md)
- [Reliability](../RELIABILITY.md)
- [Security design](../SECURITY.md)
