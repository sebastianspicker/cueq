# Product Spec: Roster & Shift Planning (FR-300)

> **Status:** ✅ Implemented | **Scope:** Core + API + Web

---

## 1. Summary

FR-300 delivers operational roster planning for shift teams:

- draft roster creation and publication
- shift creation/editing/deletion inside a roster period
- multi-person shift assignments
- publish-time minimum staffing gate
- plan-vs-actual coverage metrics based on overlapping work bookings

The feature is intentionally manual-first: no optimization or auto-scheduling in this phase.

## 2. Contracts and Entry Points

### Database

- `Roster` (`DRAFT | PUBLISHED | CLOSED`)
- `Shift` (keeps legacy `personId` for compatibility)
- `ShiftAssignment` (new join entity for multi-person staffing)

### Shared Schemas (`@cueq/shared`)

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

## 3. RBAC and Lifecycle Rules

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
4. On success: `DRAFT -> PUBLISHED` with immutable audit entry.

## 4. Plan-vs-Actual Semantics

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

## 5. Acceptance Matrix

| Case                                              | Coverage                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| Draft roster creation and shift CRUD              | API integration tests (`apps/api/test/integration`)       |
| Assignment add/remove + overlap guard             | API integration tests (`apps/api/test/integration`)       |
| Publish shortfall validation + success transition | API integration tests (`apps/api/test/integration`)       |
| Planner-only write access                         | Compliance tests (`apps/api/test/compliance`)             |
| Plan-vs-actual deterministic metrics              | Acceptance test `AT-03` + core roster unit tests          |
| Web roster planner flow                           | Playwright acceptance tests (`apps/web/tests/acceptance`) |

## 6. Out of Scope

- Shift swap workflows
- Automatic scheduling/optimization
- Removal of legacy `Shift.personId` field (deferred compatibility cleanup)
