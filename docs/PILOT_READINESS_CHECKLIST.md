# PILOT_READINESS_CHECKLIST.md — Phase 3

---

## Pilot Scope

- Verwaltung
- Pforte
- IT Bereitschaft

## Functional Readiness

- [x] AT-01 terminal offline sync
- [x] AT-02 correction + delegation
- [x] AT-03 roster plan-vs-actual
- [x] AT-04 leave pro-rata/carry-over
- [x] AT-05 on-call compliance
- [x] AT-06 closing + deterministic CSV export
- [x] AT-07 role-based visibility
- [x] AT-08 backup/restore verification

## Operational Readiness

- [x] Terminal heartbeats available (`/v1/terminal/heartbeats`)
- [x] Terminal health snapshot available (`/v1/terminal/health`)
- [x] HR file import endpoint + CLI available
- [x] Backup/restore drill executable via `make test-backup-restore`
- [x] Weekly backup/restore CI workflow configured

## Security & Compliance

- [x] Integration token gate for terminal and HR import
- [x] No telemetry introduced
- [x] Append-only audit behavior preserved
- [x] Role-based visibility checks retained

## Go/No-Go

- [x] `make check`
- [x] `make test-all`
- [x] `make test-acceptance`
- [x] `make openapi-check`
