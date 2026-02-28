# Product Spec: API-First Integration

> **CueQ Differentiator D** — Integration as a product surface.
> **Status:** ✅ MVP Implemented

---

## 1. Summary

CueQ's API is not an implementation detail — it is a **product surface**. External systems (terminals, HR, payroll, ticketing, facility management) integrate through a documented, contract-tested, versioned API.

## 2. OpenAPI Contract

- **Source**: Generated from NestJS decorators via `@nestjs/swagger`
- **Location**: Served at `/api/docs` (Swagger UI) and exportable as JSON
- **CI validation**: The generated spec is checked against the last committed snapshot; drift fails the build
- **Versioning**: API version in URL prefix (`/v1/`) once stable

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

CueQ will emit domain events for key state changes, enabling downstream integrations:

| Event                | Trigger                  | Payload                                             |
| -------------------- | ------------------------ | --------------------------------------------------- |
| `leave.approved`     | Leave request approved   | `{ absenceId, personId, type, startDate, endDate }` |
| `closing.completed`  | Monthly close finalized  | `{ closingPeriodId, ouId, period, status }`         |
| `export.ready`       | Payroll export generated | `{ exportRunId, format, recordCount, checksum }`    |
| `booking.created`    | New time booking         | `{ bookingId, personId, timeType, source }`         |
| `roster.published`   | Shift plan published     | `{ rosterId, ouId, period }`                        |
| `violation.detected` | Policy violation found   | `{ ruleId, personId, severity, message }`           |

### Event Envelope Schema

```typescript
{
  eventId: string; // Unique event ID
  eventType: string; // e.g. "leave.approved"
  timestamp: string; // ISO 8601
  version: number; // Schema version
  source: string; // "cueq-api"
  payload: Record<string, unknown>;
}
```

> **Note**: Webhook delivery is Phase 2+. The event schema and documentation are defined now to guide API design.

## 4. Terminal Gateway

The Honeywell terminal integration is a dedicated adapter with:

- **Offline buffer**: Terminals store bookings locally when offline
- **Batch import**: Gateway imports buffered data on reconnection
- **Conflict resolution**: Duplicate detection, timestamp ordering, absence-conflict flagging
- **Monitoring**: Per-terminal heartbeat, last-seen timestamp, error counts

### Gateway Architecture

```
Honeywell Terminal → [file/CSV] → Terminal Gateway Adapter → Booking API → Database
                                         ↓
                                   Monitoring (heartbeat, errors)
```

> **TODO**: Clarify Honeywell protocol (file-based CSV vs. real-time TCP/UDP)

## 5. References

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 — Integration points
- [`docs/SECURITY.md`](../SECURITY.md) — API authentication requirements
- [`apps/api/src/main.ts`](../../apps/api/src/main.ts) — Swagger/OpenAPI setup
