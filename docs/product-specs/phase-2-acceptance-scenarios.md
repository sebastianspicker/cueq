# Product Spec: Phase 2 Acceptance Scenarios

> Status: Historical acceptance contract
> Purpose: Canonical acceptance scenario set for Phase 2 delivery.

---

## Summary

This document retains the historical `AT-01..AT-07` contract. Phase 3 extends
the release gate with `AT-08`; current execution evidence is recorded separately
in the local verification snapshot.

## Acceptance Matrix

| Case  | Scenario                                                    | Input                                                   | Required Assertions                                                                                     |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AT-01 | Buffered terminal batch ingestion (external buffer assumed) | synthetic terminal batch CSV                            | dedupe, ordering, absence-conflict flagging, audit append                                               |
| AT-02 | Correction with delegation chain                            | workflow + approver chain seed                          | delegation resolution, valid transitions, inbox actions                                                 |
| AT-03 | Roster plan-vs-actual                                       | inline direct case | mismatch detection + compliance rate                                                                    |
| AT-04 | Leave with part-time carry-over                             | inline direct case | prorated target + carry-over/forfeiture correctness                                                     |
| AT-05 | On-call + Sunday deployment                                 | inline direct case | rest compliance outcome + violation mapping                                                             |
| AT-06 | Closing + export + HR correction                            | deterministic closing period seed                       | lead + HR approval gate, checklist gating, lock enforcement, deterministic checksum, HR-only correction |
| AT-07 | Role-based visibility                                       | multi-role org/team seed                                | absence reason redaction + pending-visibility split by role                                             |
| AT-08 | Backup / restore                                            | deployment-owned rehearsal                              | Phase 3 only                                                                                            |

## Notes

- Phase 2 target was `7/8` by design (`AT-01..AT-07`). These are product
  scenarios, not a repository E2E suite.
- `AT-08` is intentionally deferred to operations hardening in Phase 3.
- Phase 2 scope is complete; use this spec as historical reference for Phase 2 acceptance behavior.

## References

- [docs/ROADMAP.md](../ROADMAP.md)
- [docs/QUALITY_GATES.md](../QUALITY_GATES.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
