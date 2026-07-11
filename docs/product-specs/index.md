# Product Specifications — Index

---

## CueQ Differentiators

These specs define what makes CueQ uniquely better than alternatives like NovaTime:

| #   | Spec                                                            | Differentiator                                    | Package/Location        | Source status              |
| --- | --------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | -------------------------- |
| A   | [Policy-as-Code](policy-as-code.md)                             | Versioned, testable, reviewable rules             | `@cueq/policy`          | Implemented in source      |
| B   | [Closing Console](closing-console.md)                           | Audit-ready monthly close as first-class workflow | `apps/api` + `apps/web` | Implemented in source      |
| C   | [On-Call Domain](oncall-domain.md)                              | First-class on-call rotations + deployments       | `@cueq/shared`          | Implemented in source      |
| D   | [API-First Integration](api-first-integration.md)               | OpenAPI contract + webhooks + terminal gateway    | `apps/api`              | Implemented in source      |
| E   | [Privacy Reporting Guardrails](privacy-reporting-guardrails.md) | Default aggregation; no accidental surveillance   | Cross-cutting           | Reference controls present |

## Parity Specifications

These specs ensure CueQ matches baseline functionality (time, leave, roster, export, org):

| Spec                                                            | Description                                          | Source       | Source status                    |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------ | -------------------------------- |
| [New User Onboarding](new-user-onboarding.md)                   | First-time employee: SSO → dashboard → first booking | PRD §6 UJ1   | Implemented in source            |
| [Phase 2 Acceptance Scenarios](phase-2-acceptance-scenarios.md) | Canonical AT-01..AT-07 historical contract           | Phase 2 Plan | Historical scenario contract     |
| [Phase 3 Acceptance Scenarios](phase-3-acceptance-scenarios.md) | Canonical AT-01..AT-08 release gate                  | Phase 3 Plan | Implemented; current run partial |
| [Time Engine Rules](time-engine-rules.md)                       | Rule evaluation: pauses, rest, max-hours, surcharges | PRD FR-200   | Implemented in source            |
| [Roster & Shift Planning](roster-shift-planning.md)             | Shift creation, min-staffing, plan-vs-actual         | PRD FR-300   | Implemented in source            |
| [Absence & Leave](absence-leave.md)                             | Leave quotas, carry-over, forfeiture, team calendar  | PRD FR-400   | Implemented in source            |
| [Workflows & Approvals](workflows-approvals.md)                 | State machine, delegation, escalation                | PRD FR-500   | Implemented in source            |
| [Monthly Closing](monthly-closing.md)                           | Cut-off, checklists, lock, HR corrections            | PRD FR-600   | Implemented in source            |
| [Reports & Export](reports-export.md)                           | Payroll export, audit reports, compliance reports    | PRD FR-700   | Implemented in source            |

Status describes repository source, not production approval. See
[`../verification-baseline.md`](../verification-baseline.md) for the latest
observed local checks.

## Traceability

Product requirements originate from stakeholder workshops and the original PRD. Each spec above references the relevant PRD sections (FR-100 through FR-700).
