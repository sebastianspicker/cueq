# Product Specifications — Index

---

## CueQ Differentiators

These specs define what makes CueQ uniquely better than alternatives like NovaTime:

| #   | Spec                                                            | Differentiator                                    | Package/Location        | Status      |
| --- | --------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | ----------- |
| A   | [Policy-as-Code](policy-as-code.md)                             | Versioned, testable, reviewable rules             | `@cueq/policy`          | 📝 Scaffold |
| B   | [Closing Console](closing-console.md)                           | Audit-ready monthly close as first-class workflow | `apps/api` + `apps/web` | 📝 Scaffold |
| C   | [On-Call Domain](oncall-domain.md)                              | First-class on-call rotations + deployments       | `@cueq/shared`          | 📝 Scaffold |
| D   | [API-First Integration](api-first-integration.md)               | OpenAPI contract + webhooks + terminal gateway    | `apps/api`              | 📝 Scaffold |
| E   | [Privacy Reporting Guardrails](privacy-reporting-guardrails.md) | Default aggregation; no accidental surveillance   | Cross-cutting           | 📝 Scaffold |

## Parity Specifications

These specs ensure CueQ matches baseline functionality (time, leave, roster, export, org):

| Spec                                          | Description                                          | Source     | Status     |
| --------------------------------------------- | ---------------------------------------------------- | ---------- | ---------- |
| [New User Onboarding](new-user-onboarding.md) | First-time employee: SSO → dashboard → first booking | PRD §6 UJ1 | 📝 Draft   |
| Time Engine Rules                             | Rule evaluation: pauses, rest, max-hours, surcharges | PRD FR-200 | 🔜 Planned |
| Roster & Shift Planning                       | Shift creation, min-staffing, plan-vs-actual         | PRD FR-300 | 🔜 Planned |
| Absence & Leave                               | Leave quotas, carry-over, forfeiture, team calendar  | PRD FR-400 | 🔜 Planned |
| Workflows & Approvals                         | State machine, delegation, escalation                | PRD FR-500 | 🔜 Planned |
| Monthly Closing                               | Cut-off, checklists, lock, HR corrections            | PRD FR-600 | 🔜 Planned |
| Reports & Export                              | Payroll export, audit reports, compliance reports    | PRD FR-700 | 🔜 Planned |

## Traceability

Product requirements originate from stakeholder workshops and the original PRD. Each spec above references the relevant PRD sections (FR-100 through FR-800).
