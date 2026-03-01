# Product Specifications — Index

---

## CueQ Differentiators

These specs define what makes CueQ uniquely better than alternatives like NovaTime:

| #   | Spec                                                            | Differentiator                                    | Package/Location        | Status             |
| --- | --------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | ------------------ |
| A   | [Policy-as-Code](policy-as-code.md)                             | Versioned, testable, reviewable rules             | `@cueq/policy`          | ✅ MVP Implemented |
| B   | [Closing Console](closing-console.md)                           | Audit-ready monthly close as first-class workflow | `apps/api` + `apps/web` | ✅ MVP Implemented |
| C   | [On-Call Domain](oncall-domain.md)                              | First-class on-call rotations + deployments       | `@cueq/shared`          | ✅ MVP Implemented |
| D   | [API-First Integration](api-first-integration.md)               | OpenAPI contract + webhooks + terminal gateway    | `apps/api`              | ✅ MVP Implemented |
| E   | [Privacy Reporting Guardrails](privacy-reporting-guardrails.md) | Default aggregation; no accidental surveillance   | Cross-cutting           | ✅ MVP Implemented |

## Parity Specifications

These specs ensure CueQ matches baseline functionality (time, leave, roster, export, org):

| Spec                                                            | Description                                          | Source       | Status         |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------ | -------------- |
| [New User Onboarding](new-user-onboarding.md)                   | First-time employee: SSO → dashboard → first booking | PRD §6 UJ1   | 📝 Draft       |
| [Phase 2 Acceptance Scenarios](phase-2-acceptance-scenarios.md) | Canonical AT-01..AT-07 scenarios for phase gate      | Phase 2 Plan | 🟡 Active      |
| [Phase 3 Acceptance Scenarios](phase-3-acceptance-scenarios.md) | Canonical AT-01..AT-08 scenarios for phase gate      | Phase 3 Plan | ✅ Complete    |
| [Time Engine Rules](time-engine-rules.md)                       | Rule evaluation: pauses, rest, max-hours, surcharges | PRD FR-200   | ✅ Implemented |
| [Roster & Shift Planning](roster-shift-planning.md)             | Shift creation, min-staffing, plan-vs-actual         | PRD FR-300   | ✅ Implemented |
| [Absence & Leave](absence-leave.md)                             | Leave quotas, carry-over, forfeiture, team calendar  | PRD FR-400   | ✅ Implemented |
| [Workflows & Approvals](workflows-approvals.md)                 | State machine, delegation, escalation                | PRD FR-500   | ✅ Implemented |
| [Monthly Closing](monthly-closing.md)                           | Cut-off, checklists, lock, HR corrections            | PRD FR-600   | 🟡 Active      |
| Reports & Export                                                | Payroll export, audit reports, compliance reports    | PRD FR-700   | 🔜 Planned     |

## Traceability

Product requirements originate from stakeholder workshops and the original PRD. Each spec above references the relevant PRD sections (FR-100 through FR-800).
