# P6.1 Coverage Gap Report

Generated: 2026-03-22 (updated)

## Summary

| Area            | Source Files   | Files w/ Tests | Coverage Status    |
| --------------- | -------------- | -------------- | ------------------ |
| Core domain     | 14 logic files | 14 tested      | 100% file coverage |
| API services    | 11 files       | 0 unit tests   | 0% unit (deferred) |
| API controllers | 18 files       | 0 unit tests   | 0% unit (deferred) |
| API common      | 18 logic files | 14 tested      | ~78% file coverage |

## Core Domain — COMPLETE (Target: >=90%)

All 14 logic files have tests. Quality: EXCELLENT across the board.

### Tests written in P6.1

| File           | Functions                      | Tests Added |
| -------------- | ------------------------------ | ----------- |
| break-utils.ts | requiredBreakMinutes           | 14 new      |
| utils.ts       | roundToTwo, toViolation, toIso | +17 added   |

### Existing tests — Quality Assessment

- absence.test.ts: 61 tests — EXCELLENT (covers leave-ledger, prorating, working-days)
- workflow.test.ts: 75 tests — EXCELLENT
- evaluate-time-rules.test.ts: 55 tests — EXCELLENT
- flextime.test.ts: 31 tests — EXCELLENT
- roster.test.ts: 23 tests — EXCELLENT
- plausibility.test.ts: 21 tests — EXCELLENT
- surcharge.test.ts: 21 tests — EXCELLENT
- oncall-rest.test.ts: 19 tests — EXCELLENT
- closing.test.ts: 16 tests — EXCELLENT
- build-audit-entry.test.ts: 12 tests + 5 compliance tests — EXCELLENT
- time-engine.test.ts: 11 tests — GOOD

## API Common — 78% Coverage

### Tested files (14/18)

| File                                   | Tests | Quality |
| -------------------------------------- | ----- | ------- |
| guards/auth.guard.ts                   | 5     | GOOD    |
| guards/roles.guard.ts                  | 6     | GOOD    |
| filters/prisma-exception.filter.ts     | 6     | GOOD    |
| filters/zod-exception.filter.ts        | 3     | GOOD    |
| pipes/zod-validation.pipe.ts           | 7     | GOOD    |
| pipes/parse-cuid.pipe.ts               | 9     | GOOD    |
| http/cors-options.ts                   | 4     | GOOD    |
| http/read-response-body.ts             | 4     | GOOD    |
| http/webhook-url.ts                    | 10    | GOOD    |
| csv/parse-csv.ts                       | 5     | GOOD    |
| integrations/integration-token.ts      | 7     | GOOD    |
| auth/auth.service.ts                   | 4     | GOOD    |
| auth/role-mapping.ts                   | 4     | GOOD    |
| auth/mock-identity-provider.adapter.ts | 14    | GOOD    |

### Untested files (4/18) — justified exclusions

| File                                   | Reason                          |
| -------------------------------------- | ------------------------------- |
| auth/auth.types.ts                     | Pure type definitions, no logic |
| auth/identity-provider.port.ts         | Interface definition, no logic  |
| auth/oidc-identity-provider.adapter.ts | Needs JWKS/JWT mocking (P6.2)   |
| auth/saml-identity-provider.adapter.ts | Needs JWT secret/mocking (P6.2) |

### Decorators (excluded from metrics — trivial wrappers)

| File                              | Reason                                          |
| --------------------------------- | ----------------------------------------------- |
| decorators/public.decorator       | One-line SetMetadata wrapper                    |
| decorators/roles.decorator        | One-line SetMetadata wrapper                    |
| decorators/current-user.decorator | Param decorator, needs NestJS execution context |

## Deferred to P6.2

- 11 API service files (require Docker/DB for meaningful tests)
- 18 API controller files (require app bootstrapping for contract tests)
- OIDC/SAML identity provider adapters (require JWT infrastructure mocking)
