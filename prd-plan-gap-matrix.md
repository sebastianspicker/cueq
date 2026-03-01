# PRD/Plan vs Repo Gap Matrix — Post-Implementation Snapshot

## Snapshot

- Date: 2026-03-01
- Scope: `docs/product-specs/*.md`, `docs/PLANS.md`, `docs/exec-plans/*`, implementation/tests in `apps/*`, `packages/*`, CI/scripts.

## Classification Legend

- `implemented`: implemented and evidenced in code/tests/docs.
- `external-confirmation`: requires default-branch post-merge evidence, not local branch proof.

## Matrix (High-Level)

| Requirement Group                                           | Status                | Notes                                                                |
| ----------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- | ---------------------------- |
| Committed gaps from initial inventory                       | implemented           | Governance/docs/status/quality/test semantics reconciled             |
| FR-100 onboarding                                           | implemented           | API dashboard metadata + web orientation/quick actions + tests       |
| Workflow deferred flows (`SHIFT_SWAP`, `OVERTIME_APPROVAL`) | implemented           | Create endpoints + decision side effects + tests                     |
| Export format evolution (`CSV_V1`, `XML_V1`)                | implemented           | Format-aware export + artifact endpoint + compatibility CSV endpoint |
| Report custom builder                                       | implemented           | Options + preview endpoints, allowlist guards, web UI + tests        |
| Policy admin UI                                             | implemented           | `/[locale]/policy-admin` + API role guards + acceptance coverage     |
| HR API provider                                             | implemented           | `HR_PROVIDER_MODE=stub                                               | http` + HTTP adapter + tests |
| SAML adapter                                                | implemented           | `AUTH_PROVIDER=saml` + validation tests (issuer/audience/signature)  |
| Honeywell protocol finalization                             | implemented           | `HONEYWELL_CSV_V1` file endpoint + parser + tests + docs closure     |
| Phase-0 DoD default-branch CI assertion                     | external-confirmation | Kept explicit in `docs/PLANS.md`                                     |

## Gate Summary

- `make check` must be green after changes.
- Milestone suites required by plan:
  - `make test-acceptance`
  - `make test-integration`
  - `make test-compliance`
  - `make test-all`
