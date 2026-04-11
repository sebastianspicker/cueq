# Product Spec: Phase 2 Acceptance Scenarios

> **Status:** ✅ Complete (Historical Baseline)
> **Purpose:** Canonical acceptance scenario set for Phase 2 delivery.

---

## Summary

Phase 2 is complete when acceptance tests `AT-01..AT-07` pass against deterministic seed data and API/UI contract expectations.
This document is retained as the historical baseline for Phase 2, while Phase 3 extends the gate with `AT-08`.

## Acceptance Matrix

| Test  | Scenario                         | Seed / Fixture                                          | Required Assertions                                                                                     |
| ----- | -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AT-01 | Terminal offline buffer sync     | synthetic terminal batch CSV                            | dedupe, ordering, absence-conflict flagging, audit append                                               |
| AT-02 | Correction with delegation chain | workflow + approver chain seed                          | delegation resolution, valid transitions, inbox actions                                                 |
| AT-03 | Roster plan-vs-actual            | `fixtures/reference-calculations/pforte-shift.json`     | mismatch detection + compliance rate                                                                    |
| AT-04 | Leave with part-time carry-over  | `fixtures/reference-calculations/part-time-change.json` | prorated target + carry-over/forfeiture correctness                                                     |
| AT-05 | On-call + Sunday deployment      | `fixtures/reference-calculations/it-oncall.json`        | rest compliance outcome + violation mapping                                                             |
| AT-06 | Closing + export + HR correction | deterministic closing period seed                       | lead + HR approval gate, checklist gating, lock enforcement, deterministic checksum, HR-only correction |
| AT-07 | Role-based visibility            | multi-role org/team seed                                | absence reason redaction + pending-visibility split by role                                             |
| AT-08 | Backup / restore                 | restore fixture set                                     | **Phase 3 only**                                                                                        |

## Notes

- Phase 2 target is **7/8** by design (`AT-01..AT-07`).
- `AT-08` is intentionally deferred to operations hardening in Phase 3.
- Phase 2 scope is complete; use this spec as historical reference for Phase 2 acceptance behavior.

## References

- [docs/PLANS.md](../PLANS.md)
- [docs/QUALITY_SCORE.md](../QUALITY_SCORE.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
