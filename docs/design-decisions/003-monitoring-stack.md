# ADR-003: Monitoring and Alerting Stack

- Status: Accepted
- Date: 2026-03-01
- Deciders: Platform Team, Operations Team

## Context

Reliability targets require consistent health, metrics, and alert visibility for API, web, database integration jobs, terminal gateway heartbeats, and closing/export workflows.

## Decision

Adopt a Prometheus + Alertmanager + Grafana stack as the default monitoring baseline.

- Prometheus: scrape metrics and health probes
- Alertmanager: routing and alert deduplication
- Grafana: dashboards and trend visualization

For hosted environments where this stack is unavailable, an equivalent managed stack is acceptable if it provides:

- metric retention and alert routing parity
- role-based dashboard access
- auditability of alert configuration changes

## Consequences

### Positive

- Standardized, vendor-neutral baseline
- Strong fit for on-prem university operations
- Clear migration path to managed observability

### Negative

- Requires explicit dashboard and alert rule ownership
- Requires maintenance of scrape targets and labels

## Operational Defaults

- Health alert threshold: non-200 for 60 seconds
- Terminal stale alert: no heartbeat for 30 minutes
- Export failure alert: failed run or no run in expected period
- Closing deadline alert: period not completed by configured cutoff window
