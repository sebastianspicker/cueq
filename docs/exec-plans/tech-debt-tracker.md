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

| # | Item | Impact | Effort | Owner | Target Date | Status | Notes |
|---|---|---|---|---|---|---|---|
| TD-001 | No CI pipeline yet | 🔴 High | 🟢 Low | TBD | Phase 0 | ⏳ Pending | Blocks all validation; see [PLANS.md](../PLANS.md) Phase 0 |
| TD-002 | No JSON Schema definitions | 🔴 High | 🟡 Medium | TBD | Phase 0 | ⏳ Pending | Type generation depends on this |
| TD-003 | No test runner configured | 🔴 High | 🟢 Low | TBD | Phase 0 | ⏳ Pending | Cannot validate any behavior |
| TD-004 | No linter / formatter config | 🟡 Medium | 🟢 Low | TBD | Phase 0 | ⏳ Pending | Style drift accumulates fast |
| TD-005 | ADR-001 tech stack not decided | 🔴 High | 🟡 Medium | TBD | Phase 0 | ⏳ Pending | Blocks all implementation work |
| TD-006 | Honeywell terminal protocol unknown | 🟡 Medium | 🟡 Medium | TBD | Phase 1 | ⏳ Pending | Adapter design depends on this |
| TD-007 | Payroll export format undefined | 🟡 Medium | 🟡 Medium | TBD | Phase 1 | ⏳ Pending | Schema stub needs real field definitions |
| TD-008 | NRW holiday dataset not compiled | 🟢 Low | 🟢 Low | TBD | Phase 1 | ⏳ Pending | Need machine-readable holiday list for rule engine |

### Status Legend
| Symbol | Meaning |
|---|---|
| ⏳ Pending | Not started |
| 🔄 In Progress | Actively being worked on |
| ✅ Resolved | Completed (move to Resolved section) |
| 🚫 Won't Fix | Accepted risk / out of scope |

### Impact Legend
| Symbol | Meaning |
|---|---|
| 🔴 High | Blocks progress or creates systemic risk |
| 🟡 Medium | Slows development or degrades quality |
| 🟢 Low | Inconvenience; can be deferred |

### Effort Legend
| Symbol | Meaning |
|---|---|
| 🔴 High | Multiple days / complex changes |
| 🟡 Medium | Half-day to one-day effort |
| 🟢 Low | A few hours or less |

---

## Resolved Items

| # | Item | Resolved Date | Resolved By (PR) |
|---|---|---|---|
| — | _None yet_ | — | — |
