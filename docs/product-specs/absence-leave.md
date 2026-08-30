# Product Spec: Absence & Leave

## Summary

Absence and leave management includes:

- working-day leave counting (weekday + NRW-holiday aware)
- quota computation from policy and work-time model weekly hours
- prior-year carry-over with deadline forfeiture
- carry-over-first consumption order
- type-based workflow routing (`LEAVE_REQUEST`)
- team-calendar role-aware visibility (pending for leads/HR, approved-only for employees)
- HR leave-adjustment ledger with explicit audit trail

## Contracts and Entry Points

### Domain

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

## Policy Defaults

- Approval-required absence types:
  - `ANNUAL_LEAVE`, `SPECIAL_LEAVE`, `TRAINING`, `TRAVEL`, `COMP_TIME`, `FLEX_DAY`, `UNPAID`
- Auto-approved absence types:
  - `SICK`, `PARENTAL`
- Carry-over:
  - enabled
  - max days from leave policy
  - forfeiture deadline from leave policy (default `03-31`)

## Semantics

### Day Counting

- Requested absence `days` uses working days only.
- Weekends are excluded.
- Curated NRW holiday dates are excluded.

### Leave Balance

- Entitlement: policy annual entitlement × (`workTimeModel.weeklyHours / policy.fullTimeWeeklyHours`) × pro-rata month factor.
- Carry-over: previous-year remaining, capped by policy max.
- Consumption: carry-over bucket is consumed first.
- Forfeiture: unused carry-over expires after policy deadline.
- Adjustments: explicit HR entries are added as delta days.

### Team Calendar

- Employee and shift-planner view: `APPROVED` absences in the caller's
  organization unit, with type and note redacted.
- Team lead and HR view: `REQUESTED` + `APPROVED` absences in the caller's
  organization unit, with type and note visible.
- Admin has no team-calendar route access.
- Response includes:
  - `status` (workflow-relevant state)
  - `visibilityStatus = "ABSENT"` (privacy-safe display hint)

## Evidence and Verification Limits

- Pure calculation source: `packages/domain/src/absence/`.
- API feature source: `apps/api/src/modules/absence/`.
- Runtime contracts: `packages/contracts/src/schemas/absence.ts`.
- Web surfaces: `apps/web/src/app/[locale]/leave/` and
  `apps/web/src/app/[locale]/team-calendar/`.

The current tree does not contain a feature-specific PostgreSQL integration
suite or browser acceptance suite for absence. Exercise request, cancellation,
role visibility, adjustment, and calendar behavior against a disposable
PostgreSQL instance and browser before treating those paths as verified.

## Out of Scope

- Per-person weekday calendars beyond Monday-Friday baseline
- eAU external integration
- automated leave-planning recommendations
