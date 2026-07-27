# Product Spec: Privacy Reporting Guardrails

> Repository source and contract guardrails are described here.
> They are not proof of GDPR/DSGVO compliance, works-council approval,
> service-backed enforcement, or deployment review.

---

## 1. Summary

Individual performance or behavior reporting can require works-council
co-determination and additional data-protection review. cueq therefore treats
report scope, role authorization, group-size suppression, and access logging as
explicit reporting constraints.

## 2. Design Principles

### Default: Aggregation

- All standard reports default to aggregated views (team, OE, or organization level)
- Individual-level reports require explicit role authorization and are logged in the audit trail
- Minimum group size for aggregated statistics: configurable, default ≥5 people to prevent re-identification

### Review Gate for New Reports

Changes that add a report or modify report visibility must address:

- what data is shown and whether it identifies individuals;
- whether the report enforces the configured minimum group size;
- which roles and organization scopes can request it;
- whether report access appends an audit record; and
- whether an institution-specific works-council or data-protection review is
  required.

The repository pull request template records these review points. Completing
that checklist is not proof of institutional approval.

### Governance Evidence Boundary

Works-council minutes, reviewer identities, internal tickets, and signed
decisions must stay in the institution's approved private records system. A PR
may carry an opaque reference identifier, but must not copy the underlying
private record into this public repository.

### Forbidden Patterns

The following report types are prohibited unless explicitly approved by the works council:

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

### Query-level enforcement

- The current team-absence and overtime helpers calculate organization-scoped
  aggregates and suppress results below the configured group size.
- Individual breakdowns require a separate code path with explicit role checks.

### API-level enforcement

- Report helpers check role and organization scope before returning data.
- Sensitive compliance reports require `HR`, `ADMIN`, or the specifically
  permitted oversight role.
- Current report helper paths append `REPORT_ACCESSED` audit entries.

### UI-level enforcement

- The reports page exposes only the report types permitted by its role hint.
  API authorization remains authoritative.
- Aggregate results include the API-provided suppression state and population.

## 4. References

- [`docs/SECURITY.md`](../SECURITY.md) §5: Works council compliance
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md): "Privacy by Default" principle
- [`apps/api/src/phase2/helpers/reporting-analytics.helper.ts`](../../apps/api/src/phase2/helpers/reporting-analytics.helper.ts): Aggregate and suppression logic
- [`.github/pull_request_template.md`](../../.github/pull_request_template.md): Review checklist
