# Product Spec: Absence & Leave (FR-400)

> **Status:** ✅ Implemented | **Scope:** Core + API + Web

---

## 1. Summary

FR-400 delivers absence and leave management with:

- working-day leave counting (weekday + NRW-holiday aware)
- quota computation from policy and work-time model weekly hours
- prior-year carry-over with deadline forfeiture
- carry-over-first consumption order
- type-based workflow routing (`LEAVE_REQUEST`)
- team-calendar role-aware visibility (pending for leads/HR, approved-only for employees)
- HR leave-adjustment ledger with explicit audit trail

## 2. Contracts and Entry Points

### Core

- `calculateAbsenceWorkingDays(...)`
- `calculateLeaveLedger(...)`
- existing `calculateProratedMonthlyTarget(...)`

### API

- `POST /v1/absences`
- `POST /v1/absences/{id}/cancel`
- `GET /v1/absences/me`
- `GET /v1/leave-balance/me`
- `GET /v1/calendar/team`
- `POST /v1/leave-adjustments` (HR/Admin)
- `GET /v1/leave-adjustments` (HR/Admin)

### Web

- `/[locale]/leave` (request + balance + own absences)
- `/[locale]/team-calendar` (date-range + role-aware status rendering)

## 3. Policy Defaults

- Approval-required absence types:
  - `ANNUAL_LEAVE`, `SPECIAL_LEAVE`, `TRAINING`, `TRAVEL`, `COMP_TIME`, `FLEX_DAY`, `UNPAID`
- Auto-approved absence types:
  - `SICK`, `PARENTAL`
- Carry-over:
  - enabled
  - max days from leave policy
  - forfeiture deadline from leave policy (default `03-31`)

## 4. Semantics

### Day Counting

- Requested absence `days` uses working days only.
- Weekends are excluded.
- NRW holiday dates from fixture datasets are excluded.

### Leave Balance

- Entitlement: policy annual entitlement × (`workTimeModel.weeklyHours / policy.fullTimeWeeklyHours`) × pro-rata month factor.
- Carry-over: previous-year remaining, capped by policy max.
- Consumption: carry-over bucket is consumed first.
- Forfeiture: unused carry-over expires after policy deadline.
- Adjustments: explicit HR entries are added as delta days.

### Team Calendar

- Employee view: `APPROVED` absences only, redacted type/note.
- Team lead/HR/Admin: `REQUESTED` + `APPROVED`, with reason fields visible.
- Response includes:
  - `status` (workflow-relevant state)
  - `visibilityStatus = "ABSENT"` (privacy-safe display hint)

## 5. Acceptance Coverage

| Case                                               | Coverage                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Working-day counting with holidays                 | `packages/core/src/core/absence/__tests__/absence.test.ts` |
| Carry-over-first consumption + forfeiture boundary | `packages/core/src/core/absence/__tests__/absence.test.ts` |
| Request → workflow approval/rejection              | `apps/api/test/integration/fr400.integration.test.ts`      |
| Cancellation semantics                             | `apps/api/test/integration/fr400.integration.test.ts`      |
| Leave-adjustment HR APIs + balance projection      | `apps/api/test/integration/fr400.integration.test.ts`      |
| AT-04 carry-over + forfeiture assertions           | `apps/api/test/acceptance/phase2.acceptance.test.ts`       |
| AT-07 pending visibility split by role             | `apps/api/test/acceptance/phase2.acceptance.test.ts`       |
| Employee redaction compliance                      | `apps/api/test/compliance/phase2.compliance.test.ts`       |
| Web leave request + role visibility flow           | `apps/web/tests/acceptance/phase2.acceptance.spec.ts`      |

## 6. Out of Scope

- Per-person weekday calendars beyond Monday-Friday baseline
- eAU external integration
- automated leave-planning recommendations
