# Product Specifications

These documents describe the behavior and constraints represented in the
current source tree.

| Specification                                                   | Scope                                          | Primary source                   |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| [Policy as Code](policy-as-code.md)                             | Versioned workforce rules                      | `packages/policy`                |
| [Closing Console](closing-console.md)                           | Traceable monthly-close workflow               | `apps/api` and `apps/web`        |
| [On-Call Domain](oncall-domain.md)                              | On-call rotations and deployments              | Contracts, domain, API, and web  |
| [API-First Integration](api-first-integration.md)               | OpenAPI, webhooks, HR, and terminal boundaries | `apps/api`                       |
| [Privacy Reporting Guardrails](privacy-reporting-guardrails.md) | Aggregation and reporting constraints          | Reporting modules and contracts  |
| [New User Onboarding](new-user-onboarding.md)                   | Manual alpha token to first booking            | People, session, and web modules |
| [Time Engine Rules](time-engine-rules.md)                       | Pause, rest, hours, and surcharge evaluation   | Domain and policy packages       |
| [Roster and Shift Planning](roster-shift-planning.md)           | Staffing and plan-versus-actual behavior       | Scheduling modules and domain    |
| [Absence and Leave](absence-leave.md)                           | Leave, carry-over, and team calendar behavior  | Absence modules and domain       |
| [Workflows and Approvals](workflows-approvals.md)               | State, delegation, and escalation              | Workflow modules and domain      |
| [Monthly Closing](monthly-closing.md)                           | Cut-off, checklist, lock, and corrections      | Closing modules and domain       |
| [Reports and Export](reports-export.md)                         | Payroll export and aggregate reporting         | Reporting and closing modules    |

Source and contract presence is not service-backed proof, deployment approval,
audit certification, or GDPR/DSGVO compliance evidence. Candidate evidence
requirements are recorded in
[`../../RELEASE_STATUS.md`](../../RELEASE_STATUS.md).

The specifications do not imply database or browser coverage where the
repository has none.
