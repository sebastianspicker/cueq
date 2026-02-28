# OPERATIONS_RUNBOOK.md — Phase 3 Integrations & Ops

---

## 1. Scope

This runbook covers operational procedures introduced in Phase 3:

- Terminal heartbeat and sync health
- HR master data import (file-first)
- Payroll export (`CSV_V1`)
- Backup/restore verification (AT-08)

## 2. Commands

| Purpose                          | Command                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Full local validation            | `make check`                                                                   |
| Acceptance including AT-08       | `make test-acceptance`                                                         |
| Backup/restore drill (AT-08)     | `make test-backup-restore`                                                     |
| Phase 3 seed data                | `pnpm --filter @cueq/database db:seed:phase3`                                  |
| Reset Phase 3 seed               | `pnpm --filter @cueq/database db:reset:phase3`                                 |
| HR import (CLI)                  | `node scripts/hr-import.mjs --file fixtures/integrations/hr-master-phase3.csv` |
| FR-400 leave-adjustment backfill | `pnpm backfill:leave-adjustments -- --year 2026`                               |

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

### CLI Import

Use file-first import for pilot batches:

```bash
node scripts/hr-import.mjs --file fixtures/integrations/hr-master-phase3.csv
```

## 5. Payroll Export Operations

- Trigger export: `POST /v1/closing-periods/{id}/export`
- Download artifact: `GET /v1/closing-periods/{closingPeriodId}/export-runs/{runId}/csv`
- Format: `CSV_V1`
- Deterministic checksum: `SHA-256` over canonical CSV payload

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
