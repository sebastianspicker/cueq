# Product Spec: New User Onboarding

> **Status:** ✅ Implemented

---

## 1. Summary

When a new employee is provisioned via HR/IdM master data import and logs in for the first time via SSO, they should arrive at a functional dashboard within seconds — seeing their work-time model, current balance, and the ability to make their first booking or submit a leave request.

---

## 2. User Story

> As a **newly onboarded employee** (Verwaltung, Gleitzeit),
> I want to **log in via SSO, see my dashboard with correct Soll/Ist, and make my first booking**,
> so that **I can start tracking time immediately without manual setup**.

---

## 3. Preconditions

- HR/IdM has synced the employee's master data (person, OE, work-time model, supervisor relationship)
- SSO provider has the employee's identity
- Employee's role is `Mitarbeitende` (default)

---

## 4. Flow

1. Employee navigates to the cueq web application.
2. SSO redirect → authentication → role mapping.
3. First login: system displays a brief orientation (work-time model, booking options, key actions).
4. Dashboard shows:
   - Current day's Soll (target hours from work-time model)
   - Current balance (Ist − Soll) — zero for a new employee
   - Quick actions: "Kommen" (clock in), "Urlaub beantragen" (request leave)
5. Employee clicks "Kommen" → booking is created → dashboard updates.
6. At day's end: employee clocks out → daily balance calculated.

---

## 5. Acceptance Criteria

| #    | Criterion                                                                      | Testable?                             |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------- |
| AC-1 | SSO login succeeds and maps to correct role + OE                               | ✅ Integration test                   |
| AC-2 | Dashboard shows correct work-time model name and daily target                  | ✅ Unit test (model lookup) + UI test |
| AC-3 | First booking creates a `Booking` entity with correct `TimeType` and timestamp | ✅ Unit test + acceptance test        |
| AC-4 | Audit trail records the booking creation with user ID and timestamp            | ✅ Compliance test                    |
| AC-5 | Dashboard language defaults to German; English selectable                      | ✅ UI test                            |

---

## 6. Privacy Considerations

- [x] No PII beyond what is synced from HR/IdM (name, OE, model, role)
- [x] First-login orientation does not collect additional personal data
- [x] Dashboard shows only the employee's own data

Evidence mapping: FR-100 integration coverage verifies onboarding metadata shape and first-login behavior (`apps/api/test/integration/fr100.integration.test.ts`); orientation is content-only in dashboard onboarding UI (`apps/web/src/app/[locale]/dashboard/page.tsx`); dashboard summary is identity-scoped through authenticated user resolution in Phase 2 service logic (`apps/api/src/phase2/phase2.service.ts`) and covered by API compliance tests (`apps/api/test/compliance/phase2.compliance.test.ts`).

---

## 7. Out of Scope

- Mobile onboarding (future)
- Terminal registration (handled via Honeywell badge assignment, separate process)
- Supervisor-side view of new hire (covered by team management spec)

---

## 8. Follow-up Notes

- Orientation content is implemented in the dashboard onboarding card and remains copy-tunable.
- No profile-completion step is required for MVP; IdM/HR import data is sufficient.
- Default language remains German (`/de`) with explicit English route switch (`/en`).

---

## 9. References

- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md) — Glossary for domain terms
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 — SSO integration
