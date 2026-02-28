# Product Spec: Time Engine Rules (FR-200)

> **Status:** ✅ Implemented | **Scope:** Core + API + Web Sandbox

---

## 1. Summary

FR-200 provides deterministic rule evaluation for:

- mandatory pauses (break deficits)
- minimum rest periods
- max daily and weekly hours
- surcharge classification for night/weekend/holiday

The implementation is request-driven and policy-backed, with no DB migration requirement.

## 2. Contracts and Entry Points

### Core Contract

- JSON Schema: [`schemas/domain/core-time-rule-evaluation.schema.json`](../../schemas/domain/core-time-rule-evaluation.schema.json)
- Generated type: `CoreTimeRuleEvaluationContract`
- Core function: `evaluateTimeRules(...)` in [`packages/core/src/core/time-engine/index.ts`](../../packages/core/src/core/time-engine/index.ts)

### Policy Rules

- Surcharge policy rule: [`packages/policy/src/rules/surcharge-rules.ts`](../../packages/policy/src/rules/surcharge-rules.ts)
- Policy catalog includes `SURCHARGE_RULE`

### API

- Endpoint: `POST /v1/time-engine/evaluate`
- Controller: [`apps/api/src/phase2/controllers/time-engine.controller.ts`](../../apps/api/src/phase2/controllers/time-engine.controller.ts)
- Service guardrails:
  - roles allowed: `TEAM_LEAD`, `SHIFT_PLANNER`, `HR`, `ADMIN`
  - audit action: `TIME_RULES_EVALUATED`

### Web Sandbox

- Route: `/[locale]/time-engine`
- UI: manual bearer token + editable JSON payload + structured result output

## 3. Rule Defaults

- Timezone default: `Europe/Berlin`
- Worked time types: `WORK`, `DEPLOYMENT`
- Non-work type: `PAUSE`
- Surcharge matrix (flat):
  - `NIGHT`: `25%` (`20:00-06:00`)
  - `WEEKEND`: `50%`
  - `HOLIDAY`: `100%`
- Overlap strategy: `HIGHEST_ONLY`
- Tie-break precedence: `HOLIDAY > WEEKEND > NIGHT`
- Output for surcharges: `category + minutes + ratePercent` (no monetary conversion)

## 4. Acceptance Matrix

| Case                                             | Coverage                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Pause deficit after threshold                    | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`                            |
| Rest deficit across adjacent work intervals      | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`                            |
| Max daily warning and extended-limit violation   | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`                            |
| Max weekly violation                             | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`                            |
| Weekend/night overlap uses highest-only category | `fixtures/reference-calculations/time-engine-surcharge-weekend-night.json` + fixture parity   |
| Holiday outranks weekend/night                   | `fixtures/reference-calculations/time-engine-surcharge-holiday-overlap.json` + fixture parity |
| Cross-midnight night classification              | `packages/core/src/core/time-engine/__tests__/time-engine.test.ts`                            |
| API role restriction for endpoint                | `apps/api/test/compliance/phase2.compliance.test.ts`                                          |
| API endpoint behavior and surcharge response     | `apps/api/test/integration/phase3.integration.test.ts`                                        |
| OpenAPI includes endpoint path                   | `apps/api/test/integration/openapi.contract.test.ts`                                          |
| Web route availability (`/de` + `/en`)           | `apps/web/tests/acceptance/phase2.acceptance.spec.ts`                                         |

## 5. Out of Scope

- Monetary payout calculation from surcharge minutes
- Full TV-L tariff edge-case automation
- Persistent rule-evaluation records beyond audit metadata
