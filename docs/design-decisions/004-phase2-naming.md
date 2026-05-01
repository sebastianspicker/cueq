# ADR-004: `phase2/` Directory Naming in the API

> **Status:** Proposed
> **Date:** 2026-04-19
> **Deciders:** Project lead, backend team

---

## Context

The API application (`apps/api/src/`) has a top-level directory named `phase2/`. This directory contains the majority of the operational surface area: approval inbox, workflow runtime, shift planning, closing workflows, policy management, and reporting.

The name originates from the delivery phasing used during initial development (Phase 0 through Phase 3). It was a pragmatic grouping decision made to ship the feature cluster quickly.

### What `phase2/` contains today

```
apps/api/src/phase2/
├── controllers/        # REST endpoints: workflows, approvals, roster, closing, reports, policies
├── services/           # Domain service orchestrators (workflows-domain, roster, reporting, etc.)
├── helpers/            # 18 helper files (4,326 LOC) — business logic per sub-domain
└── workflow-runtime.service.ts  # Approval state machine entry point
```

This is not a modular breakdown — it is a single feature-phase boundary that contains heterogeneous sub-domains.

### The problem

- `phase2/` is not a domain concept. Newcomers cannot infer what it contains from the name.
- It makes it harder to split responsibilities as the codebase grows (e.g., extracting roster into its own module).
- There is no obvious place for Phase 3+ features — should they go into `phase2/` or a new top-level?
- Code search for "workflow" or "roster" logic will always return `phase2/` results, requiring mental disambiguation.

---

## Options Considered

### Option A: Rename to domain-scoped directories immediately

Split `phase2/` into:

```
apps/api/src/
├── workflows/     # Approval inbox, delegation, escalation, policy management
├── roster/        # Shift planning, plan-vs-actual, roster lifecycle
├── closing/       # Month-end checklist, export runs, corrections
├── reporting/     # Report generation, FR-700 endpoints
└── person/        # (already exists as a separate module)
```

**Pros:** Correct long-term structure; domain names are self-documenting.  
**Cons:** ~4,300 LOC to move; all imports change; high merge-conflict risk; must coordinate with open PRs.

### Option B: Keep `phase2/` with documented intent; rename after feature freeze

Accept the current name as a temporary grouping. Document the intent in `ARCHITECTURE.md` and this ADR. Schedule rename as a dedicated refactoring PR after the production launch stabilisation window (≥8 weeks post-launch with no major PRs in flight).

**Pros:** Zero churn now; safe to ship; planned cleanup path.  
**Cons:** Name drift continues during stabilisation period.

### Option C: Introduce a `core-api/` umbrella without domain split

Rename `phase2/` → `core-api/` to remove the phase reference without committing to a full split.

**Pros:** Single rename, easy to grep.  
**Cons:** `core-api/` is still not domain-meaningful; defers the real problem.

---

## Decision

**Option B — keep `phase2/` with documented intent; rename post-launch.**

Rationale:

1. The directory contains >4,000 lines of code across 18 helpers and 8+ services. A rename during active development introduces merge-conflict risk and review overhead disproportionate to the naming benefit.
2. The team understands the current structure. Documenting it explicitly in `ARCHITECTURE.md` and this ADR provides sufficient guidance for new contributors.
3. A dedicated refactoring PR (after launch stabilisation) is lower risk than an in-flight rename.

### Accepted conventions until rename

- New features within the approval/workflow/roster/closing/reporting domains go under `phase2/`.
- No new top-level feature directories should be created in `apps/api/src/` without a follow-up ADR.
- The rename ADR (superseding this one) will be authored when the production stabilisation window opens.

---

## Consequences

- `ARCHITECTURE.md` § 4 now explicitly notes the `phase2/` origin and links to this ADR.
- Contributors reading the architecture doc will understand the naming without tribal knowledge.
- The rename is scheduled as a `refactor` PR post-launch (tracked in exec plans).
- Until renamed, `phase2/` should be treated conceptually as `workflows-and-operations/`.
