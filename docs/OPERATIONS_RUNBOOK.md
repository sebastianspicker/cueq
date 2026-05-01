# OPERATIONS_RUNBOOK.md — Phase 3 Integrations & Ops

---

## 1. Scope

This runbook covers operational procedures introduced in Phase 3:

- Terminal heartbeat and sync health
- HR master data import (file + API provider)
- Payroll export (`CSV_V1`, `XML_V1`)
- Backup/restore verification (AT-08)

## 2. Commands

| Purpose                          | Command                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Full local validation            | `make check`                                                                   |
| Acceptance including AT-08       | `make test-acceptance`                                                         |
| Backup/restore drill (AT-08)     | `make test-backup-restore`                                                     |
| Mock university demo screenshots | `make demo-screenshots`                                                        |
| Phase 3 seed data                | `pnpm --filter @cueq/database db:seed:phase3`                                  |
| Reset Phase 3 seed               | `pnpm --filter @cueq/database db:reset:phase3`                                 |
| Demo screenshot seed data        | `pnpm --filter @cueq/database db:seed:demo`                                    |
| Reset demo screenshot seed       | `pnpm --filter @cueq/database db:reset:demo`                                   |
| HR import (CLI)                  | `node scripts/hr-import.mjs --file fixtures/integrations/hr-master-phase3.csv` |
| FR-400 leave-adjustment backfill | `pnpm backfill:leave-adjustments -- --year 2026`                               |

## 2.1 Auth Provider Modes

- `AUTH_PROVIDER=mock`: local/dev token testing (`mock.<base64url-json>`)
- `AUTH_PROVIDER=oidc`: OIDC validation via issuer JWKS
- `AUTH_PROVIDER=saml`: SAML bridge token validation (`SAML_ISSUER`, `SAML_AUDIENCE`, `SAML_JWT_SECRET`)

## 3. Terminal Gateway Operations

### Heartbeats

- Endpoint: `POST /v1/terminal/heartbeats`
- Header: `x-integration-token: <TERMINAL_GATEWAY_TOKEN>`
- Health endpoint: `GET /v1/terminal/health`

### Incident Indicators

- `heartbeatAgeSeconds > 1800` (30 min) is stale
- `lastErrorCount > 0` signals degraded terminal state

## 4. HR Import Operations

### API Import

- Endpoint: `POST /v1/hr/import-runs`
- Header: `x-integration-token: <HR_IMPORT_TOKEN>`
- Payload: `{ source: "FILE", sourceFile: "...", csv: "..." }`
- API payload: `{ source: "API", sourceFile: "hr-master-http-v1" }`
- Provider config:
  - `HR_PROVIDER_MODE=stub|http`
  - `HR_MASTER_API_URL`
  - `HR_MASTER_API_TOKEN`
  - `HR_MASTER_API_TIMEOUT_MS`

### CLI Import

Use file-first import for pilot batches:

```bash
node scripts/hr-import.mjs --file fixtures/integrations/hr-master-phase3.csv
```

## 5. Payroll Export Operations

- Lead sign-off (OE periods): `POST /v1/closing-periods/{id}/lead-approve`
- HR final approval: `POST /v1/closing-periods/{id}/approve`
- Trigger export: `POST /v1/closing-periods/{id}/export` with optional body `{ "format": "CSV_V1" | "XML_V1" }`
- Download artifact: `GET /v1/closing-periods/{closingPeriodId}/export-runs/{runId}/csv`
- Download format-agnostic artifact: `GET /v1/closing-periods/{closingPeriodId}/export-runs/{runId}/artifact`
- Formats: `CSV_V1`, `XML_V1`
- Deterministic checksum: `SHA-256` over canonical payload per format

### Lock behavior and corrections

- Mutable writes overlapping `REVIEW`, `APPROVED`, `EXPORTED` periods return `409` with code `CLOSING_PERIOD_LOCKED`.
- Start post-close correction workflow: `POST /v1/closing-periods/{id}/post-close-corrections`
- Apply approved booking correction: `POST /v1/closing-periods/{id}/corrections/bookings`

### Monthly closing scheduler defaults

- `CLOSING_AUTO_CUTOFF_ENABLED=true`
- `CLOSING_CUTOFF_DAY=3`
- `CLOSING_CUTOFF_HOUR=12`
- `CLOSING_TIMEZONE=Europe/Berlin`
- `CLOSING_BOOKING_GAP_MINUTES=240`
- `CLOSING_BALANCE_ANOMALY_HOURS=40`
- `CLOSING_ALLOW_MANUAL_REVIEW_START=false`

## 5.2 Honeywell Terminal File Protocol

- Endpoint: `POST /v1/terminal/sync/batches/file`
- Protocol: `HONEYWELL_CSV_V1`
- Payload shape:
  - `terminalId`
  - `sourceFile`
  - `protocol` (`HONEYWELL_CSV_V1`)
  - `csv` (header: `personId,timeTypeCode,startTime,endTime,note`)
- Behavior:
  - malformed rows are counted and skipped
  - duplicate rows are deduplicated deterministically
  - ingestion checksum is emitted in response/audit

## 5.1 Reporting Operations (FR-700)

- Team absence report: `GET /v1/reports/team-absence`
- OU overtime report: `GET /v1/reports/oe-overtime`
- Closing completion report: `GET /v1/reports/closing-completion`
- Audit summary report: `GET /v1/reports/audit-summary`
- Compliance summary report: `GET /v1/reports/compliance-summary`

### Role access

- Aggregated reports: `TEAM_LEAD`, `HR`, `ADMIN`, `DATA_PROTECTION`, `WORKS_COUNCIL`
- Summary reports (`audit-summary`, `compliance-summary`): `HR`, `ADMIN`, `DATA_PROTECTION`, `WORKS_COUNCIL`

### Operational guardrails

- All report accesses are logged with `REPORT_ACCESSED` audit entries.
- Aggregated report suppression uses `REPORT_MIN_GROUP_SIZE` (default `5`).
- Summary report payloads are aggregate-only and do not include individual actor IDs.

## 6. Backup / Restore Verification

AT-08 automation verifies:

1. Snapshot source dataset
2. Restore into isolated schema
3. Compare row counts and dataset checksum
4. Verify audit continuity and write `BACKUP_RESTORE_VERIFIED` audit entry

Run manually:

```bash
make test-backup-restore
```

## 7. Weekly CI Drill

Weekly workflow: `.github/workflows/backup-restore-weekly.yml`

- spins up PostgreSQL service
- runs setup + backup/restore verification
- fails on parity mismatch

## 8. Security Notes

- Never commit integration tokens
- Keep service-account scopes minimal
- Preserve append-only audit behavior
- No external telemetry

## 9. Local Demo Screenshots

Generate deterministic German demo screenshots with a dedicated mock-university dataset:

```bash
make demo-screenshots
```

Artifacts are generated locally only in:

`apps/web/test-results/demo-screenshots/latest/`

Expected files:

- `01-dashboard.png`
- `02-leave.png`
- `03-roster.png`
- `04-approvals.png`
- `05-closing.png`
- `06-reports.png`

## 10. Diagnostics

This section covers how to investigate the most common production problems.

### 10.1 Slow Queries

**Symptoms:** API response times >500 ms; health endpoint shows DB latency spikes.

**Steps:**

1. Enable PostgreSQL slow-query logging temporarily:
   ```sql
   ALTER SYSTEM SET log_min_duration_statement = '200';  -- log queries >200 ms
   SELECT pg_reload_conf();
   ```
2. Tail the Postgres log (adjust path for your deployment):
   ```bash
   tail -f /var/log/postgresql/postgresql.log | grep duration
   ```
3. Check the most common hot paths and their indexes:

   ```sql
   -- Approval inbox (WorkflowInstance by assignee + status)
   EXPLAIN ANALYZE
   SELECT * FROM workflow_instances
   WHERE assignee_id = '<uuid>' AND status = 'PENDING';

   -- Absence status dashboard
   EXPLAIN ANALYZE
   SELECT * FROM absences
   WHERE person_id = '<uuid>' AND status IN ('PENDING', 'APPROVED');

   -- Booking lookup by person + status
   EXPLAIN ANALYZE
   SELECT * FROM bookings
   WHERE person_id = '<uuid>' AND status = 'ACTIVE';
   ```

   If any of these show `Seq Scan`, confirm the relevant indexes are present:
   - `idx_workflow_instance_assignee_status`
   - `idx_absence_person_status`
   - `idx_booking_person_status`

   Re-run `make db-migrate` if indexes are missing.

4. Reset slow-query logging after investigation:
   ```sql
   ALTER SYSTEM RESET log_min_duration_statement;
   SELECT pg_reload_conf();
   ```

---

### 10.2 Audit-Trail Gaps

**Symptoms:** Audit page shows missing actions between state transitions; compliance checks fail; payroll auditors flag unlogged changes.

**Steps:**

1. Query for entity state-change sequences that skip expected actions:
   ```sql
   -- Find Absence entities that went APPROVED → EXPORTED without a CLOSING_EXPORTED entry
   SELECT a.id, a.status
   FROM absences a
   WHERE a.status = 'EXPORTED'
     AND NOT EXISTS (
       SELECT 1 FROM audit_entries ae
       WHERE ae.entity_id = a.id
         AND ae.action = 'CLOSING_EXPORTED'
     );
   ```
2. Check for duplicate or out-of-order entries:
   ```sql
   SELECT entity_id, action, COUNT(*) AS n
   FROM audit_entries
   GROUP BY entity_id, action
   HAVING COUNT(*) > 1
   ORDER BY n DESC;
   ```
3. Verify the audit entry append-only constraint is intact (no `UPDATE`/`DELETE` permissions on `audit_entries` for the app DB user):
   ```sql
   SELECT grantee, privilege_type
   FROM information_schema.role_table_grants
   WHERE table_name = 'audit_entries'
     AND grantee = '<app_db_user>';
   ```
   Only `SELECT` and `INSERT` should be present.
4. If gaps are found, file a compliance incident. Do **not** back-fill audit entries manually — create a corrective entry with `action = 'AUDIT_GAP_NOTED'` and document the root cause.

---

### 10.3 Workflow Escalation Failures

**Symptoms:** Approvals stuck in `PENDING`; escalation notifications not sent; assignments not advancing after deadline.

**Steps:**

1. Check for stale `PENDING` workflow instances past their SLA:
   ```sql
   SELECT id, workflow_type, assignee_id, created_at,
          NOW() - created_at AS age
   FROM workflow_instances
   WHERE status = 'PENDING'
     AND created_at < NOW() - INTERVAL '48 hours'
   ORDER BY age DESC;
   ```
2. Verify that delegation rules are active for the affected workflow type:
   ```sql
   SELECT * FROM workflow_delegation_rules
   WHERE workflow_type = '<type>'
     AND active = true;
   ```
3. Check the API logs for escalation side-effect errors:
   ```bash
   grep -i "escalat\|delegation\|workflow.*error" /var/log/cueq/api.log | tail -100
   ```
4. If escalation is stuck due to a missing delegate (e.g., HR user deactivated):
   - Assign a new delegate via `PUT /v1/workflows/delegations` (HR/Admin role required).
   - Manually trigger re-assignment via `PATCH /v1/workflows/:id` with the new `assigneeId`.
5. For permanent escalation loop issues, check the policy `escalationAfterHours` value:
   ```sql
   SELECT type, config->>'escalationAfterHours' AS sla_hours, active_from, active_to
   FROM workflow_policies
   WHERE active_to IS NULL
   ORDER BY type;
   ```

---

### 10.4 Interpreting Health Check Payloads

The readiness endpoint is `GET /health/ready`. A `200` response with the following structure indicates all subsystems are operational:

```json
{
  "status": "ok",
  "db": "ok",
  "terminalLastSeen": {
    "pforte-01": "2026-04-19T08:45:00.000Z",
    "pforte-02": "2026-04-19T08:44:58.000Z"
  },
  "latestHrImport": "2026-04-19T06:00:00.000Z",
  "latestPayrollExport": "2026-04-18T23:59:00.000Z"
}
```

| Field                 | Expected                    | Action if stale/missing                                          |
| --------------------- | --------------------------- | ---------------------------------------------------------------- |
| `db`                  | `"ok"`                      | Check Postgres container; run `docker compose ps`                |
| `terminalLastSeen`    | All terminals within 15 min | Check terminal network; inspect terminal firmware logs           |
| `latestHrImport`      | Within 25 h (daily import)  | Re-trigger `POST /v1/hr-import` manually; check SFTP credentials |
| `latestPayrollExport` | Present if period is closed | Check `ClosingPeriod.status`; re-trigger export if stuck         |

A `503` response means at least one subsystem is unhealthy. The `status` field will be `"error"` and individual fields will show `"degraded"` or an error message.

**Common false positives:**

- Terminals show stale during network maintenance windows (expected; suppress alerts for scheduled windows).
- `latestHrImport` stale on weekends if HR has no Saturday delivery — confirm with HR schedule.
