# Product Spec: Reports & Export (FR-700)

> **Status:** ✅ Implemented  
> **Source:** PRD FR-700

---

## 1. Summary

FR-700 defines the reporting and export surface for payroll, audit, and compliance operations.

- deterministic payroll export (`CSV_V1`, `XML_V1`)
- privacy-preserving aggregated operational reports
- append-only audit visibility for report access and export actions
- custom report builder with whitelisted report/metric combinations

## 2. Scope

### In Scope

- payroll export trigger + artifact download
- format-agnostic artifact download endpoint (`csv` compatibility endpoint kept)
- report endpoints:
  - `team-absence`
  - `oe-overtime`
  - `closing-completion`
  - `audit-summary`
  - `compliance-summary`
  - `custom/options`
  - `custom/preview`
- role-based visibility and privacy suppression
- report access audit logging

### Out of Scope

- individual employee performance reports
- unrestricted/free-form report SQL builder

## 3. Payroll Export

- export trigger: `POST /v1/closing-periods/{id}/export` (`HR`/`ADMIN`) with optional `{ "format": "CSV_V1" | "XML_V1" }`
- compatibility download: `GET /v1/closing-periods/{closingPeriodId}/export-runs/{runId}/csv` (`HR`/`ADMIN`/`PAYROLL`)
- artifact download: `GET /v1/closing-periods/{closingPeriodId}/export-runs/{runId}/artifact` (`HR`/`ADMIN`/`PAYROLL`)
- determinism:
  - unchanged data + same format => stable checksum
  - unchanged data + different format => checksum may differ

## 4. Reports

### Existing aggregated reports

- `GET /v1/reports/team-absence`
- `GET /v1/reports/oe-overtime`
- `GET /v1/reports/closing-completion`

### FR-700 summary reports

- `GET /v1/reports/audit-summary`
- `GET /v1/reports/compliance-summary`
- `GET /v1/reports/custom/options`
- `GET /v1/reports/custom/preview`

### Role policy

- aggregated reports: `TEAM_LEAD`, `HR`, `ADMIN`, `DATA_PROTECTION`, `WORKS_COUNCIL`
- restricted summary reports (`audit-summary`, `compliance-summary`): `HR`, `ADMIN`, `DATA_PROTECTION`, `WORKS_COUNCIL`
- denied: `EMPLOYEE`, `SHIFT_PLANNER`; `PAYROLL` denied on summary reports

## 5. Privacy & Compliance Guardrails

- reports return aggregated data only
- suppression thresholds remain configurable (`REPORT_MIN_GROUP_SIZE`, default `5`)
- report access is recorded via `REPORT_ACCESSED`
- summary reports must not expose actor IDs or individual-level payloads

## 6. Acceptance Criteria

- payroll export remains deterministic across repeated runs with identical data
- XML export and artifact endpoint are available while CSV compatibility endpoint remains functional
- payroll can download export artifact but cannot trigger export
- summary reports enforce role gates and return aggregate-only payloads
- custom preview rejects non-whitelisted metric/report combinations
- OpenAPI includes FR-700 query parameters and response schemas
- report endpoint accesses are append-only audit logged

## 7. References

- [docs/product-specs/privacy-reporting-guardrails.md](./privacy-reporting-guardrails.md)
- [docs/product-specs/monthly-closing.md](./monthly-closing.md)
- [docs/OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md)
