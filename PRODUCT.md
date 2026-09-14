# Product

cueq combines time recording, leave, staffing, and HR administration in a
German-first workspace.

The reference organization is a German university. Other organizations can
adapt the workflows, but need to review the included policies, calendar,
languages, and roles against their own requirements. The
[feature guide](docs/product-specs/README.md) describes what is implemented; the
[release status](RELEASE_STATUS.md) lists what remains before operational use.

## Who uses it

Employees need everyday tasks to be quick: record arrival or departure, check a
balance, request leave, or correct a missed booking. They should be able to see
whether a request is still open and who needs to act next.

Team leads need enough context to decide requests and cover shifts without
seeing unrelated personnel details. HR staff need more detailed records for
employment changes, monthly closing, policy administration, and reporting.
Payroll, data protection, and works council roles have narrower access for
exports and review. The API enforces these permissions.

## Interface principles

Show the record and the action together. A booking should show its time,
source, and status; a request should show its dates, reason, and decision. A
balance should make clear which period it covers and when it was calculated.

Use tables, aligned labels, and consistent spacing to make dense information
readable. Keep common actions easy to find. Keyboard shortcuts help frequent
users, but every action also needs a visible control.

Explain unavailable actions. If a month cannot be closed, show which checks or
approvals are missing. Distinguish pending work, failed requests, and completed
changes in words as well as color.

Show only the personal information needed for the task. Absence reasons,
exports, and audit records need particular care. Restricted information must
be omitted from responses and rendered markup. cueq is not intended to score
employee productivity or monitor individual activity for that purpose.

## Language and accessibility

German is the primary interface language, with English translations maintained
alongside it. Code uses English names. Interface text should use familiar
terms and explain unfamiliar administrative language where needed.

WCAG 2.2 AA is the accessibility target, not a certification. The interface
should support keyboard navigation, visible focus, reduced motion, light and
dark themes, zoom, and narrow screens. Time and amount columns use tabular
numerals so values are easy to compare. Loading, empty, error, and success
states should tell the reader what happened and what they can do next.

See [Frontend](docs/FRONTEND.md) for implementation details.

## Decisions for each organization

The reference policies do not establish which collective agreement, legal,
retention, privacy, or employee-representation rules apply to another
organization. The organization operating cueq must decide and review those
rules, along with identity management, deployment, monitoring, backups, and
payroll integration.
