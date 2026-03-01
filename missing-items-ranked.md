# Missing Items (Ranked) — 2026-03-01 Refresh

## Summary

No open functional implementation gaps were found for PRD coverage `FR-100..FR-700`.
All in-repo docs/governance closure tasks in PR-1 are implemented; one external post-merge confirmation remains.

## Committed Gaps (Actionable)

### P2 (External Confirmation)

1. **`GOV-PH0-DOD-2`**
   - Problem: default-branch CI-green proof cannot be established from local branch.
   - Fix: attach default-branch workflow URL + commit SHA after merge.

## Deferred / Out-of-Scope (No Current Blocker)

1. Workflow admin UI for policies/delegations.
2. Unrestricted/free-form SQL-style report builder.
3. Mobile onboarding and supervisor-side new-hire view.
4. eAU integration and automated leave-planning recommendations.

## Already Resolved in This Program

- Governance/docs alignment (`GOV-SEC-CONTACT`, `GOV-ADR-002`, `GOV-SLA`, `GOV-MONITOR-STACK`)
- Execution-plan and traceability reconciliation (`DOC-EXEC-*`, `DOC-PLANS-*`, `DOC-AGENTS-PACKAGES`, `FR-800-TRACE`)
- Quality/command gates (`CMD-TEST-ALL`, `QG-LINK-CI`, `QG-SCHEMA-DUP-LINT`, `QG-A11Y-*`)
- Feature gaps previously identified in committed and deferred buckets (FR-100, FR-500 deferred flows, FR-700 extensions, policy admin, HR provider, SAML, Honeywell protocol)
