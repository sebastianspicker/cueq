# Product Spec: Policy-as-Code

> **CueQ Differentiator A** — Rules are versioned, testable, reviewable, and rollback-capable.
> **Status:** 📝 Scaffold | **Package:** `@cueq/policy`

---

## 1. Summary

Unlike traditional time-tracking systems where rules are buried in configuration UIs or hard-coded, CueQ treats **policy rules as first-class code artifacts**:

- **Versioned**: every rule has `effectiveFrom`/`effectiveTo` dates and a monotonic version number
- **Testable**: a "golden-case" test suite validates all rules in CI — no policy change ships without passing
- **Reviewable**: policy changes go through the same PR process as code; diffs are human-readable
- **Rollback-capable**: previous rule versions are retained; rollback is a config change, not a code deploy

## 2. Rule Categories

| Category    | Package Path                                   | Description                                         |
| ----------- | ---------------------------------------------- | --------------------------------------------------- |
| Break rules | `packages/policy/src/rules/break-rules.ts`     | ArbZG §4: mandatory breaks after 6h/9h work         |
| Rest rules  | `packages/policy/src/rules/rest-rules.ts`      | ArbZG §5: 11h minimum rest; cross-midnight handling |
| Max hours   | `packages/policy/src/rules/max-hours-rules.ts` | ArbZG §3: 8h/day (10h extended), 48h/week           |
| Leave rules | `packages/policy/src/rules/leave-rules.ts`     | TV-L §26: 30 days, pro-rata, carry-over, forfeiture |

## 3. Golden-Case Test Suite

Located at `packages/policy/src/__tests__/golden-cases.test.ts`. This suite:

1. Validates all default rules against their Zod schemas
2. Asserts specific legal minimums (e.g., 30min break after 6h, 11h rest)
3. Will be extended with reference calculation fixtures as the evaluation engine is built

**CI gate**: The `test:golden` script runs in CI and must pass for any PR touching `packages/policy/`.

## 4. Policy Changelog

Policy changes should be documented in a CHANGELOG within the package:

```
packages/policy/CHANGELOG.md
```

Each entry includes: version number, effective date, what changed, why, and approval reference.

## 5. TODO: Confirm

- [ ] Additional rule categories needed (surcharges, closing rules, shift swap rules)
- [ ] Policy changelog format (keep-a-changelog vs. custom)
- [ ] Admin UI for viewing active policies (Phase 2+)

## 6. References

- [`packages/policy/`](../../packages/policy/) — Package source
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md) — "Configuration Over Hard-Coding" principle
