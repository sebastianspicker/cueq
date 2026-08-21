# Product Spec: Phase 3 Acceptance Scenarios

> Evidence: Scenario contract present in the repository; current
> service-backed run is partial and no deployment approval is asserted.
> Purpose: Canonical acceptance scenario set for Phase 3 delivery.

---

## Summary

The Phase 3 scenarios describe the candidate behavior that must be reviewed
against deterministic seed data, direct contracts, and deployment-owned
operational checks.

## Acceptance Matrix

| Case  | Scenario                                                    | Input                                                   | Required Assertions                                                                                                           |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AT-01 | Buffered terminal batch ingestion (external buffer assumed) | synthetic terminal batch CSV                            | dedupe, ordering, absence-conflict flagging, audit append, deterministic checksum                                             |
| AT-02 | Correction with delegation chain                            | workflow + approver chain seed                          | delegation resolution, valid transitions, inbox actions                                                                       |
| AT-03 | Roster plan-vs-actual                                       | inline direct case | mismatch detection + compliance rate                                                                                          |
| AT-04 | Leave with part-time carry-over                             | inline direct case | prorated target + carry-over/forfeiture correctness                                                                           |
| AT-05 | On-call + Sunday deployment                                 | inline direct case | rest compliance outcome + violation mapping                                                                                   |
| AT-06 | Closing + export + HR correction                            | deterministic closing period seed                       | lead + HR approval gate, checklist gating, lock enforcement, canonical `CSV_V1` export, deterministic checksum, HR correction |
| AT-07 | Role-based visibility                                       | multi-role org/team seed                                | absence reason redaction + pending-visibility split by role                                                                   |
| AT-08 | Backup / restore                                            | deployment-owned rehearsal                              | backup snapshot, restore parity, row-count/checksum parity, audit continuity checks                                           |

## Operational Assertions

- Backup/restore verification is a deployment-owned operational rehearsal.
- Terminal and HR integrations are token-gated (`TERMINAL_GATEWAY_TOKEN`, `HR_IMPORT_TOKEN`).
- Payroll export is deterministic (`CSV_V1`) and downloadable per export run.

## References

- [docs/ROADMAP.md](../ROADMAP.md)
- [docs/QUALITY_GATES.md](../QUALITY_GATES.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
