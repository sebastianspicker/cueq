# QUALITY_SCORE.md — Quality Metrics & Targets

> This document defines measurable quality targets for cueq. Each metric should be automatable and reportable in CI.

---

## 1. Test Coverage Targets

| Scope                     | Metric                             | Target               | Phase   |
| ------------------------- | ---------------------------------- | -------------------- | ------- |
| `packages/core/src/core/` | Line coverage                      | ≥90%                 | Phase 1 |
| `src/adapters/`           | Line coverage                      | ≥70%                 | Phase 2 |
| `src/api/`                | Endpoint coverage (contract tests) | 100% of OpenAPI spec | Phase 2 |
| `src/ui/`                 | Component coverage                 | ≥60%                 | Phase 2 |
| Overall                   | Line coverage                      | ≥80%                 | Phase 2 |

---

## 2. Test Suite Performance

| Suite                                 | Max Duration | Notes                               |
| ------------------------------------- | ------------ | ----------------------------------- |
| Unit (`make test-unit`)               | <10 seconds  | Pure logic; no I/O                  |
| Integration (`make test-integration`) | <60 seconds  | Docker-based; DB + mock SSO         |
| Acceptance (`make test-acceptance`)   | <5 minutes   | Full stack; 8 MVP scenarios         |
| Compliance (`make test-compliance`)   | <30 seconds  | Role visibility, audit immutability |
| All (`make test-all`)                 | <7 minutes   | Sum of above                        |

---

## 3. Acceptance Test Health

| #     | Test                             | Phase Target |
| ----- | -------------------------------- | ------------ |
| AT-01 | Terminal offline → sync          | Phase 2      |
| AT-02 | Correction → delegation chain    | Phase 2      |
| AT-03 | Roster plan-vs-actual            | Phase 2      |
| AT-04 | Leave part-time carry-over       | Phase 2      |
| AT-05 | On-call + Sunday deployment      | Phase 2      |
| AT-06 | Closing + export + HR correction | Phase 2      |
| AT-07 | Role-based visibility            | Phase 2      |
| AT-08 | Backup / restore                 | Phase 3      |

**Quality gate**: No phase is complete until its designated acceptance tests pass.

---

## 4. Schema & Type Health

| Metric                                       | Target | Check                        |
| -------------------------------------------- | ------ | ---------------------------- |
| All JSON Schemas compile                     | ✅     | `make schemas`               |
| Generated types match schemas                | ✅     | `make generate` + diff check |
| No hand-written types that duplicate schemas | ✅     | Linter rule / code review    |
| OpenAPI spec matches implementation          | ✅     | Contract tests               |

---

## 5. Code Quality

| Metric                             | Target     | Tool                  |
| ---------------------------------- | ---------- | --------------------- |
| Lint errors                        | 0          | ESLint / Biome        |
| Type errors                        | 0          | TypeScript `--noEmit` |
| Formatting drift                   | 0          | Prettier / Biome      |
| Cyclomatic complexity per function | ≤15        | Linter rule           |
| Maximum file length                | ≤400 lines | Linter rule           |

---

## 6. Documentation Quality

| Metric                              | Target | Check                                              |
| ----------------------------------- | ------ | -------------------------------------------------- |
| Broken internal links               | 0      | Markdown link checker in CI                        |
| New entity without glossary entry   | 0      | Code review checklist                              |
| ADR for every non-trivial decision  | ✅     | Code review checklist                              |
| Product spec for every feature area | ✅     | [`product-specs/index.md`](product-specs/index.md) |

---

## 7. Accessibility (UI)

| Metric                       | Target | Tool           | Phase   |
| ---------------------------- | ------ | -------------- | ------- |
| axe-core critical violations | 0      | axe-core in CI | Phase 2 |
| axe-core serious violations  | 0      | axe-core in CI | Phase 3 |
| WCAG 2.1 AA conformance      | Full   | Manual audit   | Phase 3 |

---

## 8. Operational Quality

| Metric                | Target                      | Phase    |
| --------------------- | --------------------------- | -------- |
| CI pipeline pass rate | >95% (excludes flaky infra) | Phase 0+ |
| Build-to-deploy time  | <10 minutes                 | Phase 3  |
| Backup/restore test   | Passes weekly in CI         | Phase 3  |
| Terminal health check | Heartbeat monitored         | Phase 3  |

---

## 9. Tracking

Quality metrics should be:

1. **Automated** — reported by CI, not manually tracked
2. **Visible** — dashboard or CI badge on README
3. **Trended** — track over time to detect regression

CI metrics are surfaced through GitHub Actions job summaries and required status checks.

---

## References

- [`DESIGN.md`](DESIGN.md) — Testing strategy
- [`PLANS.md`](PLANS.md) — Phase definitions and DoD
- [`RELIABILITY.md`](RELIABILITY.md) — Operational quality targets
- [`SECURITY.md`](SECURITY.md) — Security-specific quality gates
