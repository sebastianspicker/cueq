# Exec Plan: FR-700 Reports & Export

> **Status:** ✅ Complete | **Owner:** Reporting + Integrations Team | **Started:** 2026-03-01 | **Completed:** 2026-03-01

---

## Goal

Close FR-700 MVP gaps with explicit contracts, summary reporting endpoints, payroll download role support, and interactive reports UI.

## Context

The baseline already shipped deterministic `CSV_V1` export and three aggregated reports, but FR-700 lacked a dedicated product spec and complete API/UI contract hardening.

References:

- [docs/product-specs/reports-export.md](../../product-specs/reports-export.md)
- [docs/product-specs/index.md](../../product-specs/index.md)
- [docs/PLANS.md](../../PLANS.md)

## Scope

### In Scope

- FR-700 product spec publication and indexing
- schema-first report contracts for audit/compliance summaries
- explicit OpenAPI query/response contracts for report/export surfaces
- payroll role support for CSV artifact download
- audit/compliance summary endpoint implementation
- reports page interactive API client flow
- integration/compliance/acceptance test updates
- operations/security/tech-debt documentation alignment

### Out of Scope

- individual-level analytics
- unrestricted/free-form analytics builder

## Task Sequence

- [x] Iteration 0: FR-700 spec + execution-plan baseline docs
- [x] Iteration 1: shared + JSON schema contracts
- [x] Iteration 2: endpoint contract hardening + payroll download role
- [x] Iteration 3: `audit-summary` endpoint
- [x] Iteration 4: `compliance-summary` endpoint
- [x] Iteration 5: interactive reports UI
- [x] Iteration 6: docs closeout (runbook/security/tech-debt)

## Definition of Done

- [x] FR-700 spec is published and indexed
- [x] OpenAPI includes FR-700 paths with explicit query/response contracts
- [x] Payroll can download CSV artifacts without export-trigger permission
- [x] Audit/compliance summary reports are role-gated and aggregate-only
- [x] Report access remains append-only audit logged
- [x] Web reports page supports API-driven summary retrieval
- [x] `make check` passes

## Risks / Notes

- Multi-format export (`CSV_V1`, `XML_V1`) and whitelisted custom builder were implemented as follow-up slices after FR-700 baseline closeout.
