# Product features

This page is a contributor's map of the behavior implemented in cueq. For exact
request and response shapes, use the generated OpenAPI snapshot at
`contracts/openapi/openapi.json` and the Zod schemas in `packages/contracts`.

## Access model

The source defines employee, team lead, shift planner, HR, payroll,
administrator, data-protection, and works-council roles. Controllers use these
roles as a first access check. Services then apply the relevant ownership,
organization, workflow assignment, closing state, and HR capability rules.

The web client adapts its navigation to the current role. It is not an
authorization boundary; the API checks every request.

## Time, attendance, and absence

The attendance module records a person's bookings, enforces source and closing
restrictions, and supplies daily dashboard data. Pure calculations under
`packages/domain/src/time-engine` evaluate breaks, rest, daily and weekly hours,
plausibility, flexitime, and surcharge categories against the versioned rules in
`packages/policy`.

Surcharge evaluation reports minutes and percentage rates. It does not calculate
money for payroll. The included policies are reviewable reference data rather
than a legal assessment for a particular employer or employee.

The absence module handles requests, cancellation, balances, carry-over,
adjustments, and a role-aware team calendar. Working-day calculations use
weekday rules, configured work-time models, and the curated North
Rhine-Westphalia holiday calendar. Personal calendars outside that model and
electronic sickness-certificate integration are not implemented.

Relevant source:

- `apps/api/src/modules/attendance`
- `apps/api/src/modules/absence`
- `packages/domain/src/time-engine`
- `packages/domain/src/absence`
- `packages/policy/src/rules`

## Rosters and on-call work

The scheduling module supports draft rosters, shifts, assignments, publication
checks, plan-versus-actual coverage, on-call rotations, and deployments.
`ShiftAssignment` is the persisted staffing relationship. Planning is manual;
there is no optimizer or automatic scheduling engine.

On-call rest checks use the policy package. Physical terminal storage, badge
identity, and offline buffering belong to external devices or integrations.

Relevant source:

- `apps/api/src/modules/scheduling`
- `packages/domain/src/roster`
- `packages/contracts/src/schemas/roster.ts`
- `packages/contracts/src/schemas/oncall.ts`

## Workflows and monthly closing

Workflows persist their state, assignee, delegation, decision, and escalation
data. An hourly API job scans overdue work. A decision asks the feature that
owns the affected absence, booking, or roster to apply the result through an
application port.

Monthly closing moves through preparation, lead review, HR review, lock,
correction, and export states. Writes that overlap a locked period fail unless
they use an authorized correction path. The software implements checklists and
separate review steps, but each organization must decide whether those steps are
sufficient for its own closing and payroll process.

Relevant source:

- `apps/api/src/modules/workflows`
- `apps/api/src/modules/closing`
- `packages/domain/src/workflow`
- `packages/domain/src/closing`

## Personnel and appointments

A person may hold several employment appointments. Effective terms attach an
appointment to its organization, work schedule, holiday calendar, policy, and
supervisor for a period of time. Personnel fields record whether cueq or an
external source owns the value. Revision checks prevent a profile change or
source import from silently overwriting concurrent work; mismatches remain
visible for review.

Explicit capability grants protect personnel, employment, reconciliation,
project, lifecycle, and document operations. A general application role or
membership in an organization unit is not enough. The
[university HR guide](../UNIVERSITY-HR.md) explains this model in more detail.

Relevant source:

- `apps/api/src/modules/people`
- `packages/contracts/src/schemas/personnel.ts`
- `packages/contracts/src/schemas/employment.ts`

## Projects, lifecycle, and documents

Projects have a hierarchy, memberships, time allocations, privacy-aware
summaries, CSV exports, and archival. An allocation divides an existing,
completed work booking; it never creates more attendance time. Membership must
cover the booking interval. Aggregate project reports hide groups smaller than
the configured privacy threshold.

Lifecycle templates define versioned onboarding or offboarding tasks and their
dependencies. Instances snapshot the selected template version. Date-based
rules can create tasks and in-app notifications, but cannot run scripts,
provision accounts, or send email.

Private documents have versioned metadata, encrypted filesystem objects,
authorized downloads, acknowledgements, reminders, and upload recovery. An
acknowledgement confirms receipt of one version; it is not a signature. A
retention date does not delete content automatically.

Relevant source:

- `apps/api/src/modules/projects`
- `apps/api/src/modules/lifecycle`
- `apps/api/src/modules/documents`
- `packages/contracts/src/schemas/projects.ts`
- `packages/contracts/src/schemas/lifecycle.ts`
- `packages/contracts/src/schemas/documents.ts`
- `packages/database/src/document-storage.ts`

## Reports, exports, and audit

Reporting provides aggregate overtime, closing, audit, and compliance views,
plus restricted summaries and configurable report options. Group suppression
has a configurable minimum with an enforced floor of five people. Selected
restricted reads append audit entries. Individual performance rankings and
free-form SQL reports are not product features.

Closing produces authorized CSV and XML payroll artifacts. These are export
formats, not monetary payroll calculation or certification for a payroll
provider.

Audit entries cover selected sensitive reads and state changes. A database
trigger rejects row updates and deletes after its migration is applied. The
audit log is not hash-chained or externally witnessed, does not prevent
`TRUNCATE`, and does not claim to cover every possible state transition.

Relevant source:

- `apps/api/src/modules/reporting`
- `apps/api/src/modules/closing`
- `apps/api/src/modules/audit`
- `packages/database/prisma/migrations`

## Integrations

The integrations module accepts terminal heartbeats and batches, imports HR
records, administers webhook endpoints, and records delivery history. Terminal
and HR routes use separate shared integration tokens. The database package also
contains a CSV HR import command that validates the complete input before
writing an import run.

Webhook endpoint secrets are encrypted. Outbound targets reject private network
addresses by default. An administrator starts a finite dispatch through the API;
the worker recovers existing jobs but does not schedule new dispatches. The
repository does not include provider certification.

Relevant source:

- `apps/api/src/modules/integrations`
- `packages/database/scripts`

## Source and tests

Start with the source named above, then use the artifact that matches the
question:

- HTTP paths and payloads: `contracts/openapi/openapi.json`
- Runtime validation: `packages/contracts/src/schemas`
- Pure calculations: `packages/domain/src` and `packages/policy/src`
- Stored data: `packages/database/prisma/schema.prisma` and its migrations
- Domain JSON Schemas: `docs/generated/db-schema.md`
- Localized pages: `apps/web/src/app/[locale]` and [Frontend](../FRONTEND.md)

Unit and contract tests cover rules, schemas, adapters, guards, services, and
selected composition paths. PostgreSQL integration coverage is narrower, and
the repository has no committed browser end-to-end suite. A real deployment
must separately test its database, identity provider, terminals, HR source,
payroll consumer, webhook receiver, browser accessibility, backups, and
operational controls. See [Testing](../TESTING.md),
[Operations](../OPERATIONS.md), and [Security](../SECURITY.md).
