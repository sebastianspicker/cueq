# Exec Plan: Differentiators A-E MVP Rollout

> **Status:** ✅ Completed | **Owner:** Platform Team | **Started:** 2026-02-28 | **Completed:** 2026-02-28

---

## Goal

Implement CueQ differentiators A-E in pilot-ready MVP scope: policy introspection, closing console expansion, on-call rotation domain, outbox/webhook integration, and privacy-safe aggregated reports.

## Scope

### In Scope

- Policy catalog resolver + API introspection endpoints
- Closing period list/detail/review/reopen APIs and web page skeleton
- On-call rotation CRUD-lite and deployment rotation integrity checks
- Domain event outbox + webhook endpoint/delivery APIs + dispatch workflow
- Aggregated report APIs with role checks, minimum group size suppression, and audit logging
- Reports web page skeleton and privacy notice
- OpenAPI snapshot and integration/compliance/acceptance coverage updates

### Out of Scope

- Real-time external webhook signing/verification negotiation
- Individual-level reporting drill-down
- Rich UI interaction workflows (forms/state management) beyond MVP view scaffolding

## Deliverables

- Prisma schema updates for `OnCallRotation`, `DomainEventOutbox`, `WebhookEndpoint`, `WebhookDelivery`
- Shared schemas for policy/events/reporting contracts
- API endpoints under `/v1/policies`, `/v1/closing-periods`, `/v1/oncall`, `/v1/integrations`, `/v1/reports`
- Web routes `/[locale]/closing` and `/[locale]/reports`
- Updated PR template privacy-impact checklist

## Validation

- `make check` passes
- API integration/compliance/acceptance suites pass with new coverage
- OpenAPI snapshot regenerated and drift check passes

## Notes

All additions preserve repository hard rules: no telemetry, no external calls in tests beyond local/system flows, synthetic-only fixture data, and append-only audit behavior.
