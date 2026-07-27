# Product Spec: New User Onboarding

> Evidence: Repository source and focused-test references cover the stated
> onboarding surfaces. External identity-provider operation and deployment
> approval require separate evidence.

---

## 1. Summary

When a new employee is provisioned via HR/IdM master-data import and an access
token has been supplied to the alpha web client, the intended source flow shows
a dashboard with their work-time model, current balance, and first-booking or
leave-request actions. The repository does not implement an IdP redirect,
login callback, refresh flow, or response-time guarantee.

---

## 2. User Story

> As a newly provisioned employee evaluating the source alpha,
> I want to supply a mock bearer token, see my dashboard with correct
> Soll/Ist, and make my first booking, so that I can verify the onboarding
> data flow without real identity or employee data.

---

## 3. Preconditions

- Synthetic HR/IdM seed/import has created the employee's person, OE,
  work-time model, and supervisor relationship
- A matching mock bearer token is available outside the application
- Employee's role is `Mitarbeitende` (default)

---

## 4. Flow

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

---

## 5. Acceptance Criteria

| #    | Criterion                                                                      | Testable?                            |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------ |
| AC-1 | Presented token resolves the matching persisted person, role, and OE           | Auth and integration tests           |
| AC-2 | Dashboard shows correct work-time model name and daily target                  | Unit test (model lookup) and UI test |
| AC-3 | First booking creates a `Booking` entity with correct `TimeType` and timestamp | Unit test and acceptance test        |
| AC-4 | Audit trail records the booking creation with user ID and timestamp            | Compliance test                      |
| AC-5 | Dashboard language defaults to German; English selectable                      | UI test                              |

---

## 6. Privacy Considerations

- [x] No PII beyond what is synced from HR/IdM (name, OE, model, role)
- [x] Orientation does not collect additional personal data
- [x] Dashboard shows only the employee's own data

Evidence mapping: FR-100 integration coverage verifies onboarding metadata and
orientation behavior (`apps/api/test/integration/fr100.integration.test.ts`);
orientation is rendered by the dashboard UI
(`apps/web/src/app/[locale]/dashboard/dashboard-tasks.tsx`); dashboard data
is identity-scoped by `DashboardBookingsService` and `PersonHelper`. The web
token lifecycle is covered by `apps/web/src/lib/api-context.test.tsx`.

---

## 7. Out of Scope

- Native mobile onboarding (planned; not a current repository client surface)
- Terminal registration (handled via Honeywell badge assignment, separate process)
- Supervisor-side view of new hire (covered by team management spec)

---

## 8. Follow-up Notes

- Orientation content is implemented in the dashboard onboarding card and remains copy-tunable.
- No profile-completion step exists in the alpha; synthetic IdM/HR import data
  supplies the evaluated profile.
- Default language remains German (`/de`) with explicit English route switch (`/en`).

---

## 9. References

- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md): Glossary for domain terms
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6: SSO integration
