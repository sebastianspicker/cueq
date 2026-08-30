# Product Spec: Policy as Code

## Summary

cueq stores policy rules as typed repository artifacts:

- Versioned: Every rule has `effectiveFrom` and `effectiveTo` dates and a monotonic version number.
- Testable: The golden-case suite validates the committed default rules.
- Reviewable: Policy changes are ordinary source diffs.
- Rollback-capable: Previous rule versions remain available as configuration data.

## Rule Categories

| Category        | Package Path                                   | Description                                                  |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Break rules     | `packages/policy/src/rules/break-rules.ts`     | ArbZG §4: mandatory breaks after 6h/9h work                  |
| Rest rules      | `packages/policy/src/rules/rest-rules.ts`      | ArbZG §5: 11h minimum rest; cross-midnight handling          |
| Max hours       | `packages/policy/src/rules/max-hours-rules.ts` | ArbZG §3: 8h/day (10h extended), 48h/week                    |
| Leave rules     | `packages/policy/src/rules/leave-rules.ts`     | TV-L §26: 30 days, pro-rata, carry-over, forfeiture          |
| Surcharge rules | `packages/policy/src/rules/surcharge-rules.ts` | Night, weekend, and holiday surcharge windows and priorities |

## Current Test Evidence

The live focused policy suite is
`packages/policy/src/__tests__/policy-contracts.test.ts`. It provides local
source-level evidence for the policy package. It is not a PostgreSQL,
browser, deployment, or institutional-policy-approval lane.

## Current Scope

- Additional rule categories are covered by the workflow, closing, and reporting specifications.
- The active-policy UI is available at `/[locale]/policy-admin`, with `HR` and
  `ADMIN` API role gates.

## References

- [`packages/policy/`](../../packages/policy/): Package source
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md): "Configuration Over Hard-Coding" principle
