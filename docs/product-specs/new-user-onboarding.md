# Product Spec: New User Onboarding

## Summary

When a new employee is provisioned via HR/IdM master-data import and an access
token has been supplied to the alpha web client, the intended source flow shows
a dashboard with their work-time model, current balance, and first-booking or
leave-request actions. The repository does not implement an IdP redirect,
login callback, refresh flow, or response-time guarantee.

## User Story

> As a newly provisioned employee evaluating the source alpha,
> I want to supply a mock bearer token, see my dashboard with correct
> Soll/Ist, and make my first booking, so that I can verify the onboarding
> data flow without real identity or employee data.

## Preconditions

- Synthetic HR/IdM seed/import has created the employee's person, OE,
  work-time model, and supervisor relationship
- A matching mock bearer token is available outside the application
- Employee's role is `Mitarbeitende` (default)

## Flow

1. Employee navigates to the cueq web application.
2. Evaluator enters the local API base URL and mock bearer token in the
   connection panel or settings page.
3. The API verifies the token and resolves the persisted person, role, and OE;
   the dashboard displays orientation content for a person with no bookings.
4. Dashboard shows:
   - Current day's Soll (target hours from work-time model)
   - Current balance (Ist − Soll): zero for a new employee
   - Quick actions: "Kommen" (clock in), "Urlaub beantragen" (request leave)
5. Employee clicks "Kommen" → booking is created → dashboard updates.
6. At day's end: employee clocks out → daily balance calculated.

## Acceptance Criteria

| #    | Criterion                                                                      | Testable?                               |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------- |
| AC-1 | Presented token resolves the matching persisted person, role, and OE           | Requires PostgreSQL and auth runtime    |
| AC-2 | Dashboard shows correct work-time model name and daily target                  | Requires browser plus API runtime       |
| AC-3 | First booking creates a `Booking` entity with correct `TimeType` and timestamp | Requires PostgreSQL and browser runtime |
| AC-4 | Audit trail records the booking creation with user ID and timestamp            | Requires PostgreSQL inspection          |
| AC-5 | Dashboard language defaults to German; English selectable                      | Requires browser runtime                |

## Privacy Considerations

- The flow uses only PII synced from HR/IdM: name, OE, model, and role.
- Orientation does not collect additional personal data.
- The dashboard shows only the employee's own data.

Evidence mapping: the dashboard UI is rendered from
`apps/web/src/app/[locale]/dashboard/dashboard-tasks.tsx`; current session
handling uses `apps/web/src/platform/http/api-context.tsx`; identity and person
resolution are owned by `apps/api/src/modules/people/`. These are source
locations, not results from a DB-backed or browser suite.

## Out of Scope

- Native mobile onboarding
- Terminal registration and badge assignment
- Supervisor-side onboarding

The alpha has no profile-completion step; synthetic IdM/HR seed data supplies
the evaluated profile. German is the default locale (`/de`), with an explicit
English route switch (`/en`).

## References

- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md): Glossary for domain terms
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6: SSO integration
