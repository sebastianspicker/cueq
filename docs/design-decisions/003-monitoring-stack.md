# ADR-003: Monitoring boundary

- Status: Open
- Scope: Deployment assessment

## Context

The API exposes process liveness, authenticated operational health, and
terminal health. The repository has no metrics endpoint, tracing, log shipping,
packaged dashboards, or alert delivery.

## Decision

Do not select or document a monitoring stack until runtime signals, operating
ownership, privacy constraints, retention, and alert-response procedures are
defined for a deployment.

Repository documentation may describe the implemented health routes. It must
not imply that dashboards, alerts, service-level objectives, or incident
response exist.

## Consequences

- Monitoring technology remains an operator decision.
- Availability, latency, throughput, and recovery claims require deployment
  measurements.
- New telemetry requires a data-protection and access review before collection.

## References

- [Reliability](../RELIABILITY.md)
- [Operations runbook](../OPERATIONS_RUNBOOK.md)
- [Security design](../SECURITY.md)
