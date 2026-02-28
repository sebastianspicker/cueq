# Product Spec: On-Call Domain

> **CueQ Differentiator C** — On-call is a first-class domain, not just "time types".
> **Status:** 📝 Scaffold | **Schemas:** `@cueq/shared` `oncall.ts`

---

## 1. Summary

Most time-tracking systems model on-call as a generic "time type". CueQ treats it as a **dedicated subdomain** with:
- Rotation scheduling (weekly, daily, custom)
- Deployment/incident entries with optional ticket and event references
- Compliance checks (rest time after deployments)
- Reporting readiness (on-call hours, deployment count, average response time)

## 2. Data Model

### On-Call Rotation
An assignment of a person to an on-call period:
- `personId`, `organizationUnitId`
- `startTime`, `endTime` (typically week or day boundaries)
- `rotationType`: WEEKLY, DAILY, CUSTOM

### On-Call Deployment / Einsatz
An individual callout during a rotation:
- `rotationId`, `personId`
- `startTime`, `endTime`
- `remote`: boolean (at-site vs. remote resolution)
- `ticketReference`: optional link to IT ticketing system
- `eventReference`: optional link to event/incident
- `description`: free-text summary

### Compliance Check
Automated check for rest periods after deployments:
- After a night deployment, was the required 11h rest observed?
- If not, generate a policy violation

## 3. Key Use Cases

| # | Use Case | Source |
|---|---|---|
| UC-3 | System checks rest period compliance after deployment | CueQ differentiator |

## 4. Zod Schemas

Defined in [`packages/shared/src/schemas/oncall.ts`](../../packages/shared/src/schemas/oncall.ts):
- `OnCallRotationSchema`
- `OnCallDeploymentSchema`
- `CreateOnCallDeploymentSchema`
- `OnCallComplianceCheckSchema`

## 5. Policy Rules

On-call rest rules are defined in [`packages/policy/src/rules/rest-rules.ts`](../../packages/policy/src/rules/rest-rules.ts) with `onCallRestReduction` configuration.

## 6. References

- [`docs/SECURITY.md`](../SECURITY.md) — Role-based visibility for on-call data
