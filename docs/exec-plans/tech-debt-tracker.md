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

| #      | Item                                | Impact    | Effort    | Owner | Target Date | Status     | Notes                                          |
| ------ | ----------------------------------- | --------- | --------- | ----- | ----------- | ---------- | ---------------------------------------------- |
| TD-006 | Honeywell terminal protocol unknown | 🟡 Medium | 🟡 Medium | TBD   | Phase 1     | ⏳ Pending | Adapter design depends on this                 |
| TD-007 | Payroll export format undefined     | 🟡 Medium | 🟡 Medium | TBD   | Phase 1     | ⏳ Pending | `CSV_V1` standardized; future formats deferred |

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

| #      | Item                             | Resolved Date | Resolved By (PR)                                 |
| ------ | -------------------------------- | ------------- | ------------------------------------------------ |
| TD-001 | CI pipeline missing              | 2026-02-28    | Phase 0 harness implementation                   |
| TD-002 | Domain JSON schemas missing      | 2026-02-28    | Phase 0 harness implementation                   |
| TD-003 | Test scaffolding missing         | 2026-02-28    | Phase 0 harness implementation                   |
| TD-004 | ESLint/formatter harness missing | 2026-02-28    | Phase 0 harness implementation                   |
| TD-005 | ADR-001 tech stack undecided     | 2026-02-28    | [ADR-001](../design-decisions/001-tech-stack.md) |
| TD-008 | NRW holiday dataset not compiled | 2026-02-28    | Phase 1 domain core rollout                      |
