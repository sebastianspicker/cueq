# Product Specifications: Index

---

## Capability specifications

These specifications describe the current source surfaces that are specific to
cueq's evaluated scope:

| #   | Spec                                                            | Scope                                           | Package/Location        | Source status              |
| --- | --------------------------------------------------------------- | ----------------------------------------------- | ----------------------- | -------------------------- |
| A   | [Policy-as-Code](policy-as-code.md)                             | Versioned, testable, reviewable rules           | `@cueq/policy`          | Implemented in source      |
| B   | [Closing Console](closing-console.md)                           | Traceable monthly-close workflow                | `apps/api` + `apps/web` | Implemented in source      |
| C   | [On-Call Domain](oncall-domain.md)                              | First-class on-call rotations + deployments     | `@cueq/shared`          | Implemented in source      |
| D   | [API-First Integration](api-first-integration.md)               | OpenAPI contract + webhooks + terminal gateway  | `apps/api`              | Implemented in source      |
| E   | [Privacy Reporting Guardrails](privacy-reporting-guardrails.md) | Default aggregation; no accidental surveillance | Cross-cutting           | Reference controls present |

## Supporting specifications

These specifications describe the remaining time, leave, roster, export, and
organization workflows:

| Spec                                                            | Description                                          | Source       | Source status                    |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------ | -------------------------------- |
| [New User Onboarding](new-user-onboarding.md)                   | Manual alpha token → dashboard → first booking       | PRD §6 UJ1   | Source flow present; SSO absent  |
| [Phase 2 Acceptance Scenarios](phase-2-acceptance-scenarios.md) | Canonical AT-01..AT-07 historical contract           | Phase 2 Plan | Historical scenario contract     |
| [Phase 3 Acceptance Scenarios](phase-3-acceptance-scenarios.md) | Canonical AT-01..AT-08 release gate                  | Phase 3 Plan | Implemented; current run partial |
| [Time Engine Rules](time-engine-rules.md)                       | Rule evaluation: pauses, rest, max-hours, surcharges | PRD FR-200   | Implemented in source            |
| [Roster & Shift Planning](roster-shift-planning.md)             | Shift creation, min-staffing, plan-vs-actual         | PRD FR-300   | Implemented in source            |
| [Absence & Leave](absence-leave.md)                             | Leave quotas, carry-over, forfeiture, team calendar  | PRD FR-400   | Implemented in source            |
| [Workflows & Approvals](workflows-approvals.md)                 | State machine, delegation, escalation                | PRD FR-500   | Implemented in source            |
| [Monthly Closing](monthly-closing.md)                           | Cut-off, checklists, lock, HR corrections            | PRD FR-600   | Implemented in source            |
| [Reports & Export](reports-export.md)                           | Payroll export, audit reports, compliance reports    | PRD FR-700   | Implemented in source            |

The status column records repository source or contract evidence only; it is not
service-backed proof, deployment approval, audit certification, or GDPR/DSGVO
compliance evidence. Candidate evidence requirements are recorded in
[`../../RELEASE_STATUS.md`](../../RELEASE_STATUS.md).

## Traceability

The specifications retain references to the original requirement identifiers
where those identifiers still help trace source and tests.
