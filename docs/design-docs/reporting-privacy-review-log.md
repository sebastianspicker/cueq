# Reporting Privacy Review Log

> Canonical governance evidence artifact for reporting/privacy review decisions.
> Every PR that adds or changes reporting behavior must link one `review_id` entry from this log.

---

## Entry Format (Strict)

Each review entry must include all fields below.

| Field                    | Required | Description                                            |
| ------------------------ | -------- | ------------------------------------------------------ |
| `review_id`              | Yes      | Unique ID in format `RPR-YYYYMMDD-NN`                  |
| `review_date`            | Yes      | Review decision date (`YYYY-MM-DD`)                    |
| `change_scope`           | Yes      | Report endpoints/features in scope                     |
| `roles_visibility`       | Yes      | Role-to-data visibility summary                        |
| `aggregation_guardrail`  | Yes      | Minimum group size and rationale                       |
| `audit_logging_evidence` | Yes      | Audit event(s) and where verified                      |
| `works_council_decision` | Yes      | `approved` \| `approved-with-conditions` \| `rejected` |
| `decision_reference`     | Yes      | Reference ID (minutes/ticket/record)                   |
| `reviewers`              | Yes      | Reviewing roles and accountable owner                  |
| `linked_pr`              | Yes      | PR URL/path that implemented/changed scope             |
| `follow_up_actions`      | Yes      | Follow-up actions with owner/date, or `none`           |

## Entry Template

Copy this row shape for every new entry:

| review_id         | review_date  | change_scope           | roles_visibility        | aggregation_guardrail          | audit_logging_evidence         | works_council_decision | decision_reference | reviewers         | linked_pr          | follow_up_actions |
| ----------------- | ------------ | ---------------------- | ----------------------- | ------------------------------ | ------------------------------ | ---------------------- | ------------------ | ----------------- | ------------------ | ----------------- |
| `RPR-YYYYMMDD-NN` | `YYYY-MM-DD` | `<endpoints/features>` | `<role matrix summary>` | `<min-group-size + rationale>` | `<event + test/path evidence>` | `approved`             | `<reference-id>`   | `<roles + owner>` | `<pr-url-or-path>` | `none`            |

## Baseline Entry

### RPR-20260301-01

| review_id         | review_date  | change_scope                                                                                                                                                                                                                                  | roles_visibility                                                                                                                                              | aggregation_guardrail                                                                               | audit_logging_evidence                                                                                                                                      | works_council_decision     | decision_reference | reviewers                                                                                       | linked_pr                                                                     | follow_up_actions                                                                                                 |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `RPR-20260301-01` | `2026-03-01` | FR-700 reporting surface (`/v1/reports/team-absence`, `/v1/reports/oe-overtime`, `/v1/reports/closing-completion`, `/v1/reports/audit-summary`, `/v1/reports/compliance-summary`, `/v1/reports/custom/options`, `/v1/reports/custom/preview`) | Aggregated reports: `TEAM_LEAD`, `HR`, `ADMIN`, `DATA_PROTECTION`, `WORKS_COUNCIL`; restricted summary reports exclude `EMPLOYEE`, `SHIFT_PLANNER`, `PAYROLL` | `REPORT_MIN_GROUP_SIZE` default `5`; aggregation-only payloads prevent individual re-identification | `REPORT_ACCESSED` audit entries; verified in `apps/api/test/compliance/phase2.compliance.test.ts` and summary/custom report integration/compliance coverage | `approved-with-conditions` | `WC-2026-03-001`   | `WORKS_COUNCIL` delegate, `DATA_PROTECTION` officer, accountable owner: Platform Security Owner | `docs(governance): reconcile phase/spec status and reporting review evidence` | `Track annual review cadence in operations governance calendar (owner: Platform Security Owner, due: 2027-03-01)` |
