# Product Spec: Phase 3 Acceptance Scenarios

> **Status:** ✅ Completed
> **Purpose:** Canonical acceptance scenario set for Phase 3 delivery.

---

## Summary

Phase 3 is complete when acceptance tests `AT-01..AT-08` pass against deterministic seed data, integration contracts, and operational verification checks.

## Acceptance Matrix

| Test  | Scenario                         | Seed / Fixture                                          | Required Assertions                                                                                                           |
| ----- | -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AT-01 | Terminal offline buffer sync     | synthetic terminal batch CSV                            | dedupe, ordering, absence-conflict flagging, audit append, deterministic checksum                                             |
| AT-02 | Correction with delegation chain | workflow + approver chain seed                          | delegation resolution, valid transitions, inbox actions                                                                       |
| AT-03 | Roster plan-vs-actual            | `fixtures/reference-calculations/pforte-shift.json`     | mismatch detection + compliance rate                                                                                          |
| AT-04 | Leave with part-time carry-over  | `fixtures/reference-calculations/part-time-change.json` | prorated target + carry-over/forfeiture correctness                                                                           |
| AT-05 | On-call + Sunday deployment      | `fixtures/reference-calculations/it-oncall.json`        | rest compliance outcome + violation mapping                                                                                   |
| AT-06 | Closing + export + HR correction | deterministic closing period seed                       | lead + HR approval gate, checklist gating, lock enforcement, canonical `CSV_V1` export, deterministic checksum, HR correction |
| AT-07 | Role-based visibility            | multi-role org/team seed                                | absence reason redaction + pending-visibility split by role                                                                   |
| AT-08 | Backup / restore                 | restore fixture set                                     | backup snapshot, restore parity, row-count/checksum parity, audit continuity checks                                           |

## Operational Assertions

- Backup/restore verification is executable via `make test-backup-restore`.
- Terminal and HR integrations are token-gated (`TERMINAL_GATEWAY_TOKEN`, `HR_IMPORT_TOKEN`).
- Payroll export is deterministic (`CSV_V1`) and downloadable per export run.

## References

- [docs/PLANS.md](../PLANS.md)
- [docs/QUALITY_SCORE.md](../QUALITY_SCORE.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
