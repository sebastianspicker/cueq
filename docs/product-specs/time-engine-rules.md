# Product Spec: Time Engine Rules

## Summary

The time engine provides deterministic rule evaluation for:

- mandatory pauses (break deficits)
- minimum rest periods
- max daily and weekly hours
- surcharge classification for night/weekend/holiday

The implementation is request-driven and policy-backed, with no DB migration requirement.

## Contracts and Entry Points

### Core Contract

- JSON Schema: [`schemas/domain/core-time-rule-evaluation.schema.json`](../../schemas/domain/core-time-rule-evaluation.schema.json)
- Generated type: `CoreTimeRuleEvaluationContract`
- Domain function: `evaluateTimeRules(...)` in [`packages/domain/src/time-engine/index.ts`](../../packages/domain/src/time-engine/index.ts)

### Policy Rules

- Surcharge policy rule: [`packages/policy/src/rules/surcharge-rules.ts`](../../packages/policy/src/rules/surcharge-rules.ts)
- Policy catalog includes `SURCHARGE_RULE`

### API

- Endpoint: `POST /v1/time-engine/evaluate`
- Controller: [`apps/api/src/modules/attendance/time-engine.controller.ts`](../../apps/api/src/modules/attendance/time-engine.controller.ts)
- Service guardrails:
  - roles allowed: `TEAM_LEAD`, `SHIFT_PLANNER`, `HR`, `ADMIN`
  - audit action: `TIME_RULES_EVALUATED`

### Web Sandbox

- Route: `/[locale]/time-engine`
- UI: manual bearer token + editable JSON payload + structured result output

## Rule Defaults

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

## Evidence and Verification Limits

`packages/domain/src/time-engine/__tests__/time-engine.test.ts` is the current
focused domain test location. API request handling is in
`apps/api/src/modules/attendance/`; the web route is
`apps/web/src/app/[locale]/time-engine/`; request and response DTOs are in
`packages/contracts/src/schemas/time-engine.ts`.

The current tree does not contain a committed PostgreSQL integration or browser
acceptance suite for this endpoint and sandbox. Run those lanes separately when
their behavior matters.

## Out of Scope

- Monetary payout calculation from surcharge minutes
- Full TV-L tariff edge-case automation
- Persistent rule-evaluation records beyond audit metadata
