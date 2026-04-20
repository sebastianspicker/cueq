# PILOT_READINESS_CHECKLIST.md — Phase 3

> **Last verified:** 2026-04-20 | **Status:** 🔴 NOT READY — quality gates failing (see below)
>
> Items reflecting aspirational state that has not been verified against current branch are unchecked.
> Track remediation progress in [exec-plans/active/009-audit-remediation-program.md](exec-plans/active/009-audit-remediation-program.md).

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

- [ ] `make check` — ❌ **FAILING**: `pnpm typecheck` fails (roster-shift.helper.ts L26/L29); see exec-plan 009 PR-A
- [ ] `make test-all` — ❌ **FAILING**: unit tests red (flextime, fixture-parity, closing, surcharge); see exec-plan 009 PR-B/C
- [ ] `make test-acceptance`
- [x] `make openapi-check`

## Known Open Issues Before Pilot

| #    | Issue                                                       | Severity    | Exec-Plan Ref |
| ---- | ----------------------------------------------------------- | ----------- | ------------- |
| I-01 | `pnpm typecheck` fails — roster-shift.helper.ts             | 🔴 Critical | 009 PR-A      |
| I-02 | `pnpm test:unit` fails — 5 test files                       | 🔴 Critical | 009 PR-B/C    |
| I-03 | Migration chain cannot bootstrap clean DB                   | 🔴 Critical | 009 Iter 5    |
| I-04 | Cross-OU data leak in closing-completion report (TEAM_LEAD) | 🔴 High     | 009 PR-G/H    |
| I-05 | Post-close corrections bypass overlap protection            | 🔴 High     | 009 PR-H      |
| I-06 | Frontend restricted data not cleared on auth/role change    | 🔴 High     | 009 PR-J      |
