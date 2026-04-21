# Exec Plan: Phase 3 Integrations + Operations

> **Status:** ✅ Completed | **Owner:** Integrations + Ops Team | **Started:** 2026-02-28 | **Completed:** 2026-02-28

---

## Goal

Deliver Phase 3 by hardening integration and operations surfaces: terminal gateway heartbeat/health, HR file import, deterministic payroll CSV export, and automated backup/restore verification.

## Context

Phase 3 in [docs/PLANS.md](../../PLANS.md) requires integrations and operational readiness beyond the Phase 2 API/UI baseline.

References:

- [docs/PLANS.md](../../PLANS.md)
- [docs/RELIABILITY.md](../../RELIABILITY.md)
- [docs/QUALITY_SCORE.md](../../QUALITY_SCORE.md)
- [docs/product-specs/phase-3-acceptance-scenarios.md](../../product-specs/phase-3-acceptance-scenarios.md)

## Scope

### In Scope

- Terminal gateway heartbeat + health endpoints and persistence
- Terminal sync deterministic ingestion checksum
- HR master data import runs (file-first, API provider stub)
- Deterministic payroll export (`CSV_V1`) and CSV artifact download
- Backup/restore verification automation (AT-08)
- Phase 3 seed fixtures and scripts
- Operational runbook + pilot readiness checklist
- Weekly backup/restore CI drill

### Out of Scope

- Real-time Honeywell protocol (beyond CSV/file adapter)
- Full live HR API connector implementation
- Non-CSV payroll wire formats

## Task Sequence

- [x] Iteration 0: plan/docs alignment + harness reliability (`DATABASE_URL` propagation fix)
- [x] Iteration 1: terminal persistence contracts (`TerminalDevice`, `TerminalHeartbeat`, checksum in sync result)
- [x] Iteration 2: terminal gateway service extraction + heartbeat/health endpoints
- [x] Iteration 3: HR import runs + CSV file-first importer + API provider port/stub
- [x] Iteration 4: canonical payroll `CSV_V1` export + reproducibility checks + CSV download endpoint
- [x] Iteration 5: backup/restore verification script + AT-08 acceptance
- [x] Iteration 6: phase-3 pilot seed script + fixtures
- [x] Iteration 7: operations visibility and runbook/checklist docs
- [x] Iteration 8: weekly CI workflow and phase closeout docs

## Phase 3 DoD Traceability

| Phase 3 DoD Requirement                         | Implementation / Validation                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| All 8 acceptance tests pass                     | `apps/api/test/acceptance/phase2.acceptance.test.ts` (`AT-01..AT-08`)                      |
| Terminal offline→sync works with simulated data | `/v1/terminal/sync/batches` + `/v1/terminal/heartbeats` + `/v1/terminal/health` tests      |
| Export reproducibility verified                 | deterministic `CSV_V1` checksum and idempotent export assertions in acceptance/integration |
| Backup/restore tested in CI                     | `scripts/backup-restore-verify.mjs` + weekly workflow + `make test-backup-restore`         |
| Pilot readiness checklist fully green           | `docs/PILOT_READINESS_CHECKLIST.md`                                                        |

## Linked PRs / Issues

| PR/Issue                    | Description                               | Status         |
| --------------------------- | ----------------------------------------- | -------------- |
| Local implementation bundle | Phase 3 integrations + operations rollout | ✅ Implemented |

## Risks / Blockers

| Risk                                | Mitigation                                                                  | Status       |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------ |
| TD-006 Honeywell protocol unknown   | Keep CSV/file adapter and terminal gateway port abstraction                 | 🟡 Accepted  |
| TD-007 Payroll format evolution     | Ship deterministic `CSV_V1` and keep format version field explicit          | 🟡 Tracked   |
| Backup verification drift/flakiness | Schema-isolated restore + checksum + row parity + weekly CI scheduled drill | ✅ Mitigated |

## Notes

All integrations remain privacy-safe and audit-safe: no telemetry, synthetic fixtures only, and append-only audit semantics preserved.
