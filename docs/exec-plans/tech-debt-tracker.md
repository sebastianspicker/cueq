# Tech Debt Tracker

> Track known technical debt items. Review this list at the start of each phase. Items should be resolved before they compound.

---

## How to Use

1. Add new items as they're discovered during development or review.
2. Prioritize by **impact × effort** — high-impact / low-effort items first.
3. Link to the PR that resolves the item when complete.
4. Move resolved items to the "Resolved" section with a date.

---

## Active Items

| #      | Item                                                              | Impact    | Effort    | Owner         | Target Date | Status     | Notes                |
| ------ | ----------------------------------------------------------------- | --------- | --------- | ------------- | ----------- | ---------- | -------------------- |
| TD-009 | `pnpm typecheck` fails — roster-shift.helper.ts L26/L29           | 🔴 High   | 🟢 Low    | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-A   |
| TD-010 | `pnpm test:unit` red — flextime/closing/surcharge semantics       | 🔴 High   | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-B/C |
| TD-011 | Migration chain cannot bootstrap clean database                   | 🔴 High   | 🔴 High   | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 Iter 5 |
| TD-012 | Cross-OU data leak in closing-completion report (TEAM_LEAD)       | 🔴 High   | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-G/H |
| TD-013 | Post-close corrections bypass overlap protection                  | 🔴 High   | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-H   |
| TD-014 | Auth relies on token claims; DB person state not reconciled       | 🔴 High   | 🔴 High   | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-G   |
| TD-015 | Frontend restricted data not cleared on 403/auth change           | 🔴 High   | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-J   |
| TD-016 | Settings persistence is a no-op (prefs never read back)           | 🟡 Medium | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-K   |
| TD-017 | Locale: html lang always "de"; switch jumps to /de/dashboard      | 🟡 Medium | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 PR-K   |
| TD-018 | Backup/restore is logical replay, not real pg_dump/pg_restore     | 🟡 Medium | 🔴 High   | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 Iter 6 |
| TD-019 | HR import non-atomic; silently coerces unknown roles              | 🟡 Medium | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 Iter 5 |
| TD-020 | Absence date schema drifts: JSON Schema datetime vs Zod date-only | 🟡 Medium | 🟡 Medium | Platform Team | 2026-05-01  | ⏳ Pending | exec-plan 009 Iter 4 |

> All items above tracked under **[exec-plans/active/009-audit-remediation-program.md](active/009-audit-remediation-program.md)**.

### Status Legend

| Symbol         | Meaning                              |
| -------------- | ------------------------------------ |
| ⏳ Pending     | Not started                          |
| 🔄 In Progress | Actively being worked on             |
| ✅ Resolved    | Completed (move to Resolved section) |
| 🚫 Won't Fix   | Accepted risk / out of scope         |

### Impact Legend

| Symbol    | Meaning                                  |
| --------- | ---------------------------------------- |
| 🔴 High   | Blocks progress or creates systemic risk |
| 🟡 Medium | Slows development or degrades quality    |
| 🟢 Low    | Inconvenience; can be deferred           |

### Effort Legend

| Symbol    | Meaning                         |
| --------- | ------------------------------- |
| 🔴 High   | Multiple days / complex changes |
| 🟡 Medium | Half-day to one-day effort      |
| 🟢 Low    | A few hours or less             |

---

## Resolved Items

| #      | Item                                | Resolved Date | Resolved By (PR)                                             |
| ------ | ----------------------------------- | ------------- | ------------------------------------------------------------ |
| TD-001 | CI pipeline missing                 | 2026-02-28    | Phase 0 harness implementation                               |
| TD-002 | Domain JSON schemas missing         | 2026-02-28    | Phase 0 harness implementation                               |
| TD-003 | Test scaffolding missing            | 2026-02-28    | Phase 0 harness implementation                               |
| TD-004 | ESLint/formatter harness missing    | 2026-02-28    | Phase 0 harness implementation                               |
| TD-005 | ADR-001 tech stack undecided        | 2026-02-28    | [ADR-001](../design-decisions/001-tech-stack.md)             |
| TD-008 | NRW holiday dataset not compiled    | 2026-02-28    | Phase 1 domain core rollout                                  |
| TD-006 | Honeywell terminal protocol unknown | 2026-03-01    | `HONEYWELL_CSV_V1` finalized + file endpoint implemented     |
| TD-007 | Payroll export format undefined     | 2026-03-01    | Multi-format export (`CSV_V1`, `XML_V1`) + artifact endpoint |
