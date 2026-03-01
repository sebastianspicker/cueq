# Product Spec: Privacy-by-Design Reporting Guardrails

> **CueQ Differentiator E** — Default to aggregation; prevent accidental surveillance.
> **Status:** ✅ MVP Implemented

---

## 1. Summary

In a works-council (Personalrat) environment, reporting that enables individual performance or behavior monitoring is **legally and politically toxic**. CueQ's reporting system is designed with **privacy guardrails built in from day one**, not bolted on as a filter.

## 2. Design Principles

### Default: Aggregation

- All standard reports default to **aggregated** views (team, OE, or organization level)
- Individual-level reports require explicit role authorization AND are logged in the audit trail
- Minimum group size for aggregated statistics: **configurable, default ≥5 people** to prevent re-identification

### Review Gate for New Reports

Any PR that adds a new report or modifies report visibility must include:

- [ ] **Privacy Impact Assessment**: What data is shown? To whom? Can it identify individuals?
- [ ] **Aggregation check**: Does the report enforce minimum group size?
- [ ] **Role check**: Is the report restricted to appropriate roles?
- [ ] **Audit logging**: Is access to the report logged?
- [ ] **Works council review**: Has the report been reviewed against the Dienstvereinbarung?
- [ ] **Review evidence linked**: Does the PR link a `review_id` entry from the reporting privacy review log?

This checklist should be part of the PR template for any change touching `reporting/` paths.
Checklist completion is evidenced by a linked review-log entry, not by markdown checkboxes alone.

### Evidence Artifact

Canonical evidence file:

- [`docs/design-docs/reporting-privacy-review-log.md`](../design-docs/reporting-privacy-review-log.md)

Required PR linkage format:

- `docs/design-docs/reporting-privacy-review-log.md#rpr-YYYYMMDD-NN`

### Forbidden Patterns

The following report types are **explicitly prohibited** unless approved by works council:

| Pattern                           | Why Forbidden                  |
| --------------------------------- | ------------------------------ |
| Individual overtime ranking       | Enables performance comparison |
| Individual break-time analysis    | Behavior monitoring            |
| Individual correction frequency   | Implies "problem" employees    |
| Response-time tracking per person | Performance metric             |
| Login/logout pattern analysis     | Surveillance                   |

### Allowed Patterns

| Pattern                        | Conditions                                              |
| ------------------------------ | ------------------------------------------------------- |
| Team absence calendar          | Shows "absent" only; no reason for non-authorized roles |
| OE-level overtime summary      | Aggregated; min group size enforced                     |
| Closing completion rate per OE | Process metric, not individual                          |
| Violation summary per OE       | Aggregated; individual drill-down only for HR           |
| Export audit log               | System activity; no individual performance data         |

## 3. Technical Guardrails

### Query-Level Enforcement

- Reporting queries should enforce `GROUP BY` at the OE level by default
- A `HAVING COUNT(*) >= :minGroupSize` clause should be standard
- Individual breakdowns require a separate code path with explicit role check

### API-Level Enforcement

- Report endpoints check `role` before returning data
- Individual-level drill-down endpoints require `HR` or `ADMIN` role
- All report access is logged to the audit trail

### UI-Level Enforcement

- Reports show a privacy notice banner explaining what data is visible and why
- Individual data views show a warning: "This view shows individual data and is logged"

## 4. Review Gate Implementation

Add to `.github/PULL_REQUEST_TEMPLATE.md` (or report-specific template):

```markdown
## Privacy Impact (required for report changes)

- [ ] Report defaults to aggregated view
- [ ] Minimum group size enforced (≥5)
- [ ] Role-based access check implemented
- [ ] Audit logging for report access
- [ ] No individual performance/behavior metrics exposed
- [ ] Works council compatibility confirmed
```

## 5. References

- [`docs/SECURITY.md`](../SECURITY.md) §5 — Works council compliance
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md) — "Privacy by Default" principle
