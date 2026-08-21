# Product Spec: Policy as Code

> Rules are versioned, testable, and reviewable in repository source.
> Package source and focused tests are present; deployment rollback
> and institutional policy approval require separate evidence.

---

## 1. Summary

cueq stores policy rules as typed repository artifacts:

- Versioned: Every rule has `effectiveFrom` and `effectiveTo` dates and a monotonic version number.
- Testable: The golden-case suite validates the committed default rules.
- Reviewable: Policy changes are ordinary source diffs.
- Rollback-capable: Previous rule versions remain available as configuration data.

## 2. Rule Categories

| Category        | Package Path                                   | Description                                                  |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Break rules     | `packages/policy/src/rules/break-rules.ts`     | ArbZG §4: mandatory breaks after 6h/9h work                  |
| Rest rules      | `packages/policy/src/rules/rest-rules.ts`      | ArbZG §5: 11h minimum rest; cross-midnight handling          |
| Max hours       | `packages/policy/src/rules/max-hours-rules.ts` | ArbZG §3: 8h/day (10h extended), 48h/week                    |
| Leave rules     | `packages/policy/src/rules/leave-rules.ts`     | TV-L §26: 30 days, pro-rata, carry-over, forfeiture          |
| Surcharge rules | `packages/policy/src/rules/surcharge-rules.ts` | Night, weekend, and holiday surcharge windows and priorities |

## 3. Golden-Case Test Suite

Located in the `packages/policy/src/__tests__/golden-cases-*.test.ts` shards.
Together these suites:

1. Validates all default rules against their Zod schemas
2. Asserts specific legal minimums (e.g., 30min break after 6h, 11h rest)
3. Exercises the current default rules against synthetic golden cases.

CI runs the direct policy contract checks with the repository test command.

## 4. Policy Changelog

Policy changes should be documented in a CHANGELOG within the package:

```
packages/policy/CHANGELOG.md
```

Each entry includes: version number, effective date, what changed, why, and approval reference.

## 5. Confirmed Scope

- [x] Additional rule categories tracked and extended through workflow/closing/reporting specs.
- [x] Policy changelog format standardized in `packages/policy/CHANGELOG.md`.
- [x] Admin UI for active policy visibility: `web /[locale]/policy-admin` + API role gates (`HR`, `ADMIN`).

## 6. References

- [`packages/policy/`](../../packages/policy/): Package source
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md): "Configuration Over Hard-Coding" principle
