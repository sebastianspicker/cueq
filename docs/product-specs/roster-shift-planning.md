# Product Spec: Roster & Shift Planning

## Summary

Roster planning for shift teams includes:

- draft roster creation and publication
- shift creation/editing/deletion inside a roster period
- multi-person shift assignments
- publish-time minimum staffing gate
- plan-vs-actual coverage metrics based on overlapping work bookings

The feature is intentionally manual-first: no optimization or auto-scheduling in this phase.

## Contracts and Entry Points

### Database

- `Roster` (`DRAFT | PUBLISHED | CLOSED`)
- `Shift` (the staffing slot and its timing)
- `ShiftAssignment` (the authoritative join entity for multi-person staffing)

### Runtime Contracts (`@cueq/contracts`)

- `CreateRosterSchema`
- `CreateShiftSchema`
- `UpdateShiftSchema`
- `AssignShiftSchema`
- `RosterDetailSchema`
- `PlanVsActualResponseSchema`

### API

- Existing:
  - `GET /v1/rosters/current`
  - `GET /v1/rosters/{id}/plan-vs-actual`
- New:
  - `POST /v1/rosters`
  - `GET /v1/rosters/{id}`
  - `POST /v1/rosters/{id}/shifts`
  - `PATCH /v1/rosters/{id}/shifts/{shiftId}`
  - `DELETE /v1/rosters/{id}/shifts/{shiftId}`
  - `POST /v1/rosters/{id}/shifts/{shiftId}/assignments`
  - `DELETE /v1/rosters/{id}/shifts/{shiftId}/assignments/{assignmentId}`
  - `POST /v1/rosters/{id}/publish`

## RBAC and Lifecycle Rules

### Write Permissions

- Only role `SHIFT_PLANNER` may mutate roster data.
- `SHIFT_PLANNER` may mutate rosters only in their own organization unit.
- Mutations are allowed only while roster status is `DRAFT`.

### Read Permissions

- Roster reads are OU-scoped for non-HR/admin roles.
- HR/Admin can read across OUs.

### Lifecycle

1. Planner creates `DRAFT` roster for OU and period.
2. Planner manages shifts and assignments.
3. Publish validates minimum staffing (`assignedHeadcount >= minStaffing` for every shift).
4. On success: `DRAFT -> PUBLISHED` with an appended audit entry.

## Plan-vs-Actual Semantics

### Per Slot Metrics

For each shift slot:

- `assignedHeadcount`: number of assignments on the shift
- `plannedHeadcount`: `max(minStaffing, assignedHeadcount)`
- `actualHeadcount`: unique people with overlapping `WORK`/`DEPLOYMENT` bookings
- `delta`: `actualHeadcount - plannedHeadcount`
- `compliant`: `actualHeadcount >= plannedHeadcount`

### Aggregate Metrics

- `totalSlots`
- `mismatchedSlots` (exact mismatch: `plannedHeadcount !== actualHeadcount`)
- `complianceRate` (`(totalSlots - mismatchedSlots) / totalSlots`)
- `understaffedSlots` (`actualHeadcount < minStaffing`)
- `coverageRate` (`slots with actualHeadcount >= minStaffing` / `totalSlots`)

## Evidence and Verification Limits

- Domain calculations: `packages/domain/src/roster/`.
- Runtime contracts: `packages/contracts/src/schemas/roster.ts`.
- API capability: `apps/api/src/modules/scheduling/`.
- Web capability: `apps/web/src/app/[locale]/roster/`.

The committed storage-invariant test verifies assignment backfill and
deduplication against PostgreSQL. The source tree still has no browser
acceptance suite or full feature-level database suite for roster planning.
Validate mutation, OU scope, publish, assignment, and plan-versus-actual
behavior against a disposable PostgreSQL instance and browser before declaring
the whole flow verified.

## Out of Scope

- Shift swap workflows
- Automatic scheduling/optimization
