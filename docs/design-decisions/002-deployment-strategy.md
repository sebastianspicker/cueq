# ADR-002: Deployment Strategy

- Status: Accepted
- Date: 2026-03-01
- Deciders: Platform Team, Operations Team

## Context

Cueq must support pilot rollout in a university environment with strict privacy constraints, predictable operations, and low-complexity day-2 support.

## Decision

Adopt a containerized deployment model with two approved targets:

1. Primary: on-premises university infrastructure (Kubernetes or managed container platform)
2. Secondary: managed EU cloud environment with equivalent controls

Both targets use the same runtime architecture:

- Stateless API and web services
- PostgreSQL as stateful data service
- Reverse proxy/TLS termination at ingress
- Immutable build artifacts from CI
- Blue/green or rolling deployments

## Consequences

### Positive

- Same release artifact across environments
- Predictable rollback path
- Supports institutional hosting constraints

### Negative

- Requires disciplined environment configuration management
- Adds operational overhead compared to single-node deployment

## Implementation Notes

- Deployment manifests and secrets are environment-specific and not committed with credentials
- Migration strategy remains forward-only and additive-first
- Default production topology:
  - 2x API instances
  - 2x web instances
  - HA PostgreSQL managed by infra provider
