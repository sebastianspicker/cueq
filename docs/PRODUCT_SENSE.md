# Product Scope and Constraints

This document records the product boundaries represented by the current source
tree. It is not a deployment specification or an institutional approval.

## Problem domain

cueq combines workflows that are often handled by separate time-recording,
roster, absence, approval, and payroll-export systems. The repository targets a
German university context in NRW and includes domain concepts derived from
TV-L and working-time rules.

The software does not determine which rules apply to a particular institution
or employee. Legal, tariff, data-protection, accessibility, security,
works-council, and payroll-provider review remain deployment responsibilities.

## User groups represented in source

The role model and synthetic fixtures represent these groups:

| Role            | Current source surface                                        |
| --------------- | ------------------------------------------------------------- |
| Employee        | Own bookings, balances, absences, roster, and requests        |
| Team lead       | Team workflows, approvals, reports, and closing actions       |
| Shift planner   | Roster and on-call planning plus assigned approvals           |
| Human resources | Policy, closing, reporting, absence, and correction workflows |
| Payroll         | Export-related access                                         |
| Administrator   | Configuration and broad operational access                    |
| Data protection | Permitted audit and compliance report views                   |
| Works council   | Permitted aggregate report views                              |

API authorization is authoritative. Web navigation visibility is a user
interface hint and is not a security boundary.

## Current product constraints

- Time, leave, surcharge, and workflow rules are represented as versioned
  source or configuration with focused tests.
- Role and organization scope limit sensitive data access at API boundaries.
- Aggregate reports expose group-size suppression metadata and selected report
  accesses append audit entries.
- Audit records are append-only through application paths, and a PostgreSQL
  migration rejects row updates and deletes when applied.
- The German interface is primary and the English interface covers the same
  route structure.

Source and test coverage do not establish complete policy correctness, audit
coverage, privacy compliance, or deployment fitness. Candidate evidence
requirements are recorded in [RELEASE_STATUS.md](../RELEASE_STATUS.md).

## Outside the alpha scope

- production identity-provider certification and a complete browser session
  lifecycle;
- real employee, payroll, health, or institutional operational data;
- automated category-specific retention, erasure, personal-data export, and
  pseudonymization;
- physical-terminal identity, offline storage, and device hardening;
- payroll-provider acceptance and live delivery;
- native mobile clients and automated roster optimization; and
- institution-specific operational and governance approval.

## Release risks

| Risk                                   | Required treatment                                                          |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Payroll or terminal contract mismatch  | Validate the versioned contract with the target provider                    |
| Incorrect role or organization scope   | Exercise API authorization and privacy tests on the release candidate       |
| Rule interpretation mismatch           | Review policy configuration and golden cases with accountable domain owners |
| Migration or recovery failure          | Rehearse migrations and backup/restore on disposable infrastructure         |
| Browser or accessibility regression    | Run and review browser acceptance, accessibility, and screenshot checks     |
| Unreviewed institutional data handling | Keep real-data use blocked pending the required private reviews             |

## References

- [Roadmap](ROADMAP.md)
- [Release status](../RELEASE_STATUS.md)
- [Core design constraints](design-docs/core-beliefs.md)
- [Security design](SECURITY.md)
