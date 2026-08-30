# Product Spec: On-Call Domain

## Summary

cueq models on-call rotations and deployments as a dedicated subdomain with:

- Rotation scheduling (weekly, daily, custom)
- Deployment/incident entries with optional ticket and event references
- Compliance checks (rest time after deployments)
- Reporting data concepts (on-call hours and deployment count); operational
  reporting acceptance remains separate

## Data Model

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

## Key Use Cases

| Use case                                              | Source                |
| ----------------------------------------------------- | --------------------- |
| System checks rest-period compliance after deployment | Policy and core rules |

## Zod Schemas

Defined in [`packages/contracts/src/schemas/oncall.ts`](../../packages/contracts/src/schemas/oncall.ts):

- `OnCallRotationSchema`
- `OnCallDeploymentSchema`
- `CreateOnCallDeploymentSchema`
- `OnCallComplianceCheckSchema`

## Policy Rules

On-call rest rules are defined in [`packages/policy/src/rules/rest-rules.ts`](../../packages/policy/src/rules/rest-rules.ts) with `onCallRestReduction` configuration.

## References

- [`docs/SECURITY.md`](../SECURITY.md): Role-based visibility for on-call data
