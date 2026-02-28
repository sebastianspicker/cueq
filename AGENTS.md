# AGENTS.md — Agent & Contributor Guide for cueq

> **cueq** is an integrated time-tracking, absence-management, and shift-planning system for a German university (NRW / TV-L).
> This file is the primary entry point for AI coding agents and human contributors alike.

---

## 1. How to Use This Repo

### Context Loading Order

When starting work on this repo, read documents in this order:

1. **This file** (`AGENTS.md`) — conventions, constraints, commands
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — system mental model
3. [`docs/DESIGN.md`](docs/DESIGN.md) — design principles and patterns
4. [`docs/PLANS.md`](docs/PLANS.md) — current execution plans and phase
5. [`docs/product-specs/index.md`](docs/product-specs/index.md) — product requirements and specifications

### Repo Structure at a Glance

```
cueq/                          # pnpm + Turborepo monorepo
├── apps/
│   ├── api/                   # NestJS API server
│   └── web/                   # Next.js frontend
├── packages/
│   ├── database/              # Prisma schema + client (@cueq/database)
│   ├── shared/                # Zod schemas + types (@cueq/shared)
│   └── policy/                # Policy-as-code rules + golden tests (@cueq/policy)
├── schemas/                   # JSON Schema source-of-truth contracts
├── fixtures/                  # Synthetic reference fixtures
├── contracts/                 # Committed OpenAPI snapshot and API contracts
├── scripts/                   # Harness scripts used by Makefile and CI
├── docs/                      # All documentation
│   ├── design-docs/           # Design documents and core beliefs
│   ├── design-decisions/      # Architecture Decision Records (ADRs)
│   ├── exec-plans/            # Execution plans (active, completed, tech debt)
│   ├── generated/             # Auto-generated docs (DO NOT HAND-EDIT)
│   ├── product-specs/         # Product specifications
│   └── references/            # External reference material for agents
├── AGENTS.md                  # ← You are here
├── ARCHITECTURE.md            # System architecture overview
├── Makefile                   # Standard command interface
└── LICENSE                    # MIT
```

---

## 2. Small, Reviewable Change Policy

All changes to this repo MUST follow these rules:

1. **One concern per PR.** Do not mix feature work with refactoring, doc updates with code changes, or schema changes with test changes.
2. **Maximum 400 lines changed per PR** (excluding auto-generated files). If a change is larger, split it.
3. **Every PR must include:**
   - A clear title following [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description`
   - A description of _what_ changed and _why_
   - Link to the relevant exec-plan or issue
4. **Branch naming:** `type/short-description` (e.g., `feat/time-engine-rules`, `docs/glossary-update`, `fix/leave-calculation`)
5. **No force-pushes to `main`.** All changes go through PR review.

### Conventional Commit Types

| Type       | When to Use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or capability                  |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation only                         |
| `schema`   | Schema or type definition changes          |
| `test`     | Adding or updating tests                   |
| `ci`       | CI/CD pipeline changes                     |
| `refactor` | Code restructuring without behavior change |
| `chore`    | Tooling, dependencies, config              |

---

## 3. Standard Commands

> **Status:** Phase 0 harness commands are implemented and CI-enforced.

| Command                 | What It Does                                                                                          | Status         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | -------------- |
| `make setup`            | Install dependencies, start Docker services, generate Prisma client, push schema                      | ✅ Implemented |
| `make check`            | Full validation: lint + format + type-check + schema/fixture validation + tests + OpenAPI drift check | ✅ Implemented |
| `make lint`             | Run linter in check mode (no auto-fix)                                                                | ✅ Implemented |
| `make lint-fix`         | Auto-fix lint + formatting issues                                                                     | ✅ Implemented |
| `make typecheck`        | TypeScript compiler in `--noEmit` mode                                                                | ✅ Implemented |
| `make schemas`          | Validate all JSON Schemas and fixture contracts                                                       | ✅ Implemented |
| `make generate`         | Generate Prisma client + OpenAPI snapshot + generated schema docs                                     | ✅ Implemented |
| `make openapi-check`    | Compare generated OpenAPI document to committed snapshot                                              | ✅ Implemented |
| `make test-unit`        | Run unit tests only (target: <10s)                                                                    | ✅ Implemented |
| `make test-integration` | Run integration tests (requires Docker)                                                               | ✅ Implemented |
| `make test-acceptance`  | Run acceptance tests (full stack)                                                                     | ✅ Implemented |
| `make test-compliance`  | Run GDPR/audit compliance tests                                                                       | ✅ Implemented |
| `make test-all`         | Run all test suites                                                                                   | ✅ Implemented |
| `make docs`             | Generate documentation site from markdown                                                             | 🔜 Planned     |
| `make dev`              | Start development server with hot reload                                                              | ✅ Implemented |
| `make clean`            | Remove build artifacts, stop Docker, prune volumes                                                    | ✅ Implemented |

---

## 4. Definition of Done

A change is "done" when ALL of the following are true:

### For Code Changes

- [ ] `make check` passes locally
- [ ] CI pipeline is green
- [ ] New/changed behavior has corresponding tests
- [ ] Schema changes have been regenerated (`make generate`)
- [ ] Relevant documentation updated (design docs, glossary, ADRs)
- [ ] PR has been reviewed by at least one human or designated reviewer

### For Documentation Changes

- [ ] All cross-links are valid (no broken references)
- [ ] New docs are listed in the relevant `index.md`
- [ ] Terminology matches [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md) and the domain glossary
- [ ] No secrets, credentials, or PII in any document

### For Schema Changes

- [ ] Schema validates with `make schemas`
- [ ] Types regenerated with `make generate`
- [ ] Fixtures updated to match new schema (if applicable)
- [ ] Affected tests still pass

---

## 5. Security & Privacy Constraints

These constraints are **non-negotiable** and apply to every contribution:

### Hard Rules

1. **No secrets in the repo.** No API keys, passwords, tokens, or certificates. Use `.env.example` for templates.
2. **No telemetry.** Do not add any analytics, tracking, or phone-home functionality.
3. **No PII in fixtures or test data.** Use synthetic data only. Names must be obviously fictional.
4. **No external service calls in tests.** All tests must work offline with mocks or local containers.
5. **Audit trail immutability.** Any code touching the audit log must enforce append-only semantics. Deletions and mutations of audit entries are forbidden.

### GDPR / University Environment

- Data minimization: only collect and store what is required for the documented purpose.
- Role-based access: every endpoint and view must enforce role checks.
- Absence reasons are never visible to unauthorized roles (team members see "absent", not "sick").
- Reports must be configurable to avoid individual performance/behavior monitoring (works council / Personalrat compliance).
- Retention/deletion policies must be configurable per data category.

### Privacy-by-Design Checkpoints

When adding new features, confirm:

- [ ] What personal data is collected?
- [ ] Who can access it (which roles)?
- [ ] When is it deleted (retention period)?
- [ ] Is it included in any export? If so, is it necessary?
- [ ] Can reporting be aggregated to avoid individual identification?

---

## 6. Domain Context for Agents

### What is cueq?

A time-tracking and workforce management system designed for a **German university** with:

- **TV-L** (Tarifvertrag für den öffentlichen Dienst der Länder) employment rules
- **NRW** (Nordrhein-Westfalen) public holiday and labor law context
- **Shift operations** in: security desk (Pforte), IT on-call, facility services (Hausdienst), event technology (Veranstaltungstechnik)
- **Standard office hours** (Gleitzeit) in administration

### Key Domain Terms

| German          | English             | Meaning                                                |
| --------------- | ------------------- | ------------------------------------------------------ |
| Zeiterfassung   | Time tracking       | Recording work hours                                   |
| Gleitzeit       | Flextime            | Flexible working hours with core hours                 |
| Dienstplan      | Roster / shift plan | Scheduled shifts                                       |
| Rufbereitschaft | On-call duty        | Available for callout, not at workplace                |
| Monatsabschluss | Monthly closing     | End-of-month cutoff and approval process               |
| Personalrat     | Works council       | Employee representation body (co-determination rights) |
| Bezügestelle    | Payroll office      | Handles salary calculations and payments               |

For the full glossary, see [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md).

---

## 7. File Protection Rules

| Path               | Rule                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `docs/generated/*` | **Auto-generated.** Do not hand-edit. Regenerate with `make generate`. |
| `LICENSE`          | **Do not modify** without explicit approval.                           |
| `AGENTS.md`        | Modify only via docs PR with review.                                   |

---

## 8. References

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — System architecture
- [`docs/DESIGN.md`](docs/DESIGN.md) — Design principles
- [`docs/PLANS.md`](docs/PLANS.md) — Current plans and phases
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security design
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md) — Reliability and operations
- [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) — Quality metrics
- [`docs/product-specs/index.md`](docs/product-specs/index.md) — Product specifications
- [`docs/PLANS.md`](docs/PLANS.md) — Execution phases and deliverables
