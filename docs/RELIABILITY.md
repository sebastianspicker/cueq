# RELIABILITY.md — Reliability & Operations


---

## 1. Availability Targets

| Component | Target | Rationale |
|---|---|---|
| Web application | 99.5% (excl. maintenance windows) | Core employee interaction; low tolerance for downtime |
| API | 99.5% | Feeds web + future mobile |
| Database | 99.9% | Data durability is critical; managed PG or HA setup |
| Honeywell terminal gateway | 99% (with offline buffer) | Terminals buffer locally; gateway downtime doesn't lose data |
| Monthly closing/export | Available during business hours (Mo–Fr 7–18) | Batch process; not 24/7 critical |

> **TODO: confirm** — SLA numbers to be finalized with university IT and stakeholders.

---

## 2. Offline / Failover Strategy

### Terminal Offline Handling


```
Normal:  Terminal → Gateway → DB (real-time or batch)
Offline: Terminal → Local Buffer → [reconnect] → Gateway → Conflict Resolution → DB
```

- Terminals buffer bookings locally when the gateway is unreachable.
- On reconnection, the gateway imports buffered data with conflict detection:
  - **Duplicate bookings** (same person, same timestamp) → deduplicate
  - **Out-of-order timestamps** → sort and reconcile
  - **Booking during approved absence** → flag for review
- Emergency/manual bookings are tagged as `source: manual` and require approval.

### Application Failover

- The application should be deployable behind a load balancer (stateless API).
- Database failover via PostgreSQL streaming replication or managed HA.
- No in-memory session state — sessions via signed tokens (JWT) or server-side session store.

---

## 3. Backup & Restore

| Aspect | Policy |
|---|---|
| Backup frequency | Daily full + continuous WAL archiving (if PG) |
| Retention | 30 days rolling; monthly snapshots retained 12 months |
| Restore testing | Automated weekly in CI (Phase 3); manual quarterly until then |
| Recovery Time Objective (RTO) | <4 hours |
| Recovery Point Objective (RPO) | <1 hour (WAL-based) |

### Restore Test (Acceptance Test AT-08)

The automated backup/restore test verifies:
1. Create a known dataset
2. Take a backup
3. Restore to a clean environment
4. Verify data integrity (row counts, checksums, audit trail intact)

---

## 4. Monitoring & Alerting

| What | How | Alert Threshold |
|---|---|---|
| Application health | `/health` endpoint | Non-200 for >60s |
| Database connectivity | Health check includes DB ping | Connection failure |
| Terminal gateway | Heartbeat from gateway process | No heartbeat for >5min |
| Terminal heartbeats | Per-terminal last-seen timestamp | No contact for >30min |
| Export jobs | Job completion logging | Job failure or missed schedule |
| Monthly closing | Closing status per OE | Closing not completed by deadline |
| Disk / resource usage | System metrics | >80% threshold |

> **TODO: confirm** — Monitoring stack (Prometheus/Grafana, Datadog, or university-provided) to be decided.

---

## 5. Maintenance & Updates

| Aspect | Policy |
|---|---|
| Maintenance windows | Sundays 02:00–06:00 CET (low terminal usage) |
| Update strategy | Blue-green or rolling deployment; zero-downtime target |
| Rollback | Previous version retained; instant rollback via deployment tool |
| Database migrations | Forward-only; additive changes preferred; destructive changes require migration plan |
| Communication | Planned maintenance announced 5 business days in advance |

---

## 6. Incident Response

| Severity | Definition | Response Time | Example |
|---|---|---|---|
| P1 — Critical | System fully unavailable; no time tracking possible | <1 hour | DB down, API unreachable |
| P2 — Major | Core feature degraded; workaround exists | <4 hours | Export job failing, SSO intermittent |
| P3 — Minor | Non-critical feature impaired | Next business day | Report formatting issue, UI glitch |

### Incident Process

1. **Detect** — monitoring alert or user report
2. **Triage** — assign severity, notify stakeholders
3. **Mitigate** — restore service (rollback, failover, manual workaround)
4. **Root cause** — investigate; document in incident log
5. **Remediate** — fix deployed; regression test added

---

## 7. Disaster Recovery

| Scenario | Recovery Strategy |
|---|---|
| Database corruption | Restore from latest backup + WAL replay |
| Application server failure | Redeploy from CI artifacts; stateless design enables fast recovery |
| Terminal gateway failure | Terminals buffer locally; gateway restart + resync |
| Data center outage | Restore from off-site backup; RTO <4 hours |
| Ransomware / security breach | Isolate, restore from immutable backup, rotate credentials |

---

## 8. References

- [`SECURITY.md`](SECURITY.md) — Security controls and threat model
- [`QUALITY_SCORE.md`](QUALITY_SCORE.md) — Operational quality targets
- [`PLANS.md`](PLANS.md) — Phase 3 includes operational hardening
