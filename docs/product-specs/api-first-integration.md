# Product Spec: API Integration

> Source and checked-in OpenAPI contract surfaces are present.
> External-provider integration and deployment approval require separate evidence.

---

## 1. Summary

The API defines versioned integration boundaries for terminals, HR data,
payroll export, webhooks, and related external systems. The committed OpenAPI
snapshot covers the HTTP surface; provider compatibility must be verified in
each deployment.

## 2. OpenAPI Contract

- Source: Generated from NestJS decorators via `@nestjs/swagger`
- Location: Served at `/api/docs` (Swagger UI) in non-production environments; exported as JSON for CI validation
- CI validation: The generated spec is checked against the last committed snapshot; drift fails the build
- Versioning: Current API routes use the `/v1/` URL prefix

### CI OpenAPI Gate

```yaml
# In .github/workflows/ci.yml:
- name: Validate OpenAPI spec
  run: |
    # Generate current spec from NestJS
    # Compare against committed spec
    # Fail if different (forces explicit update)
```

OpenAPI snapshot comparison is implemented in `scripts/openapi-check.sh` and enforced in CI.

## 3. Webhook / Event Patterns

cueq's source defines domain-event payloads for key state changes; delivery to
an external receiver is a separately configured deployment concern:

| Event                | Trigger                  | Payload                                          |
| -------------------- | ------------------------ | ------------------------------------------------ |
| `booking.created`    | New time booking         | `{ personId, timeTypeCode, source }`             |
| `closing.completed`  | Monthly close finalized  | `{ closingPeriodId, organizationUnitId, month }` |
| `export.ready`       | Payroll export generated | `{ exportRunId, format, checksum }`              |
| `violation.detected` | Policy violation found   | `{ violations, closingPeriodId }`                |

### Event Envelope Schema

```typescript
{
  eventId: string; // Unique event ID
  eventType: string; // e.g. "leave.approved"
  timestamp: string; // ISO 8601
  version: number; // Schema version
  source: string; // "cueq-api"
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}
```

Working-tree source generates a one-time receiver secret, stores a versioned
AES-256-GCM envelope, and signs deliveries with `X-Cueq-Signature`. Deployment
key handling, migration application, receiver integration, and service-backed
delivery remain separately verified concerns.

## 4. Terminal Gateway

The Honeywell terminal integration is a dedicated adapter with:

- Offline buffer: required of the physical terminal/gateway deployment; not
  implemented by this repository
- Batch import: Gateway imports buffered data on reconnection
- Conflict resolution: Duplicate detection, timestamp ordering, absence-conflict flagging
- Monitoring: Per-terminal heartbeat, last-seen timestamp, error counts

### Gateway Architecture

```
Honeywell Terminal → [file/CSV] → Terminal Gateway Adapter → Booking API → Database
                                         ↓
                                   Monitoring (heartbeat, errors)
```

Honeywell protocol baseline is now ratified as `HONEYWELL_CSV_V1` via
`POST /v1/terminal/sync/batches/file`, while real-time protocols remain future roadmap work.

## 5. References

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6: Integration points
- [`docs/SECURITY.md`](../SECURITY.md): API authentication requirements
- [`apps/api/src/main.ts`](../../apps/api/src/main.ts): Swagger/OpenAPI setup
