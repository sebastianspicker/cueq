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
