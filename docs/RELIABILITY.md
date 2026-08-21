# Reliability and operational boundaries

This document describes runtime controls present in the repository and the
operational controls that a deployment must provide. It does not define a
service-level objective.

## Runtime dependencies

- The API requires PostgreSQL for domain operations and authenticated
  operational health.
- The web application requires the API for application data.
- Scheduled closing, workflow, and webhook work runs inside the API process.
- The local Compose file provides PostgreSQL and Keycloak on loopback-bound
  ports.

There is no load balancer, application process supervisor, high-availability
database, deployment rollback controller, multi-region recovery, or
terminal-side offline buffer in the repository.

## Health and status surfaces

`GET /health` is public process liveness. It returns the package version and
current timestamp without querying PostgreSQL.

`GET /health/ready` is restricted to HR and administrator roles. It reads
terminal, HR import, payroll export, and backup verification state from
PostgreSQL. It can return `ok` or `degraded` with HTTP 200. It is not a dedicated
database connectivity probe.

`GET /v1/terminal/health` uses the terminal integration token and reports
terminal health state.

The repository does not expose runtime metrics, traces, packaged dashboards,
log shipping, or alert delivery.

## Backup and restore

Backup and restore are deployment-owned operational exercises. The repository
does not configure production backup retention, WAL archiving, off-site
storage, recovery-time objectives, or recovery-point objectives.

## Integration recovery

Terminal batch ingestion records ordering, deduplication, conflict, and health
state. The repository does not control a physical terminal's offline storage,
badge validation, or delivery guarantees.

HR imports, export runs, outbox events, and webhook deliveries record state in
PostgreSQL. The API process contains the dispatcher and scheduler, but there is
no external job supervisor or incident escalation service.

## Operational evidence

Do not infer availability, throughput, response time, recovery time, or data
durability from unit tests or health responses. Those properties require
measurement on the exact deployment.

Deployment owners must define:

- process supervision and restart behavior;
- database backup, restore, retention, and encryption;
- secret storage and rotation;
- log access and redaction;
- monitoring and alert ownership;
- incident communication and escalation; and
- rollback and disaster-recovery exercises.

See [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) for repository maintenance
commands and [SECURITY.md](SECURITY.md) for trust boundaries.
