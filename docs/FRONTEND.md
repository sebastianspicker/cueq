# FRONTEND.md — Frontend Architecture & Conventions

> For overall system architecture, see [`ARCHITECTURE.md`](../ARCHITECTURE.md). For cross-cutting design principles, see [`DESIGN.md`](DESIGN.md).

---

## 1. Overview

The CueQ frontend is a Next.js App Router application that provides:

- employee self-service (dashboard, bookings, leave)
- planner and lead workflows (team calendar, roster, approvals)
- HR/admin operations (closing, reports, policy administration)
- DE/EN localization with externalized messages

## 2. Runtime Stack

| Concern   | Current Choice                          | Notes                                                                |
| --------- | --------------------------------------- | -------------------------------------------------------------------- |
| Framework | Next.js App Router + React              | Route-driven UI under `apps/web/src/app`                             |
| i18n      | `next-intl`                             | Locale segment routing (`/[locale]`) with `de` default, `en` support |
| API       | Browser `fetch` + shared API client     | Bearer-token based calls to API (`http://localhost:3001` in dev)     |
| Styling   | Shared global CSS + reusable components | Trusted Operations Desk tokens and responsive workspace patterns     |
| Testing   | Vitest + Playwright + axe               | Unit/integration/compliance/acceptance coverage                      |

## 3. Route Surface

Primary route tree in `apps/web/src/app/[locale]/`:

- `/dashboard`
- `/bookings`
- `/team-calendar`
- `/leave`
- `/roster`
- `/approvals`
- `/time-engine`
- `/closing`
- `/reports`
- `/oncall`
- `/policy-admin`
- `/audit`
- `/settings`

## 4. Shared Frontend Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   └── [locale]/
│       ├── layout.tsx
│       └── */page.tsx
├── components/
│   ├── AppWorkspace.tsx
│   ├── PageShell.tsx
│   ├── SectionCard.tsx
│   ├── StatusBanner.tsx
│   ├── StatusBadge.tsx
│   └── FormField.tsx
├── i18n/
├── lib/
│   ├── api-client.ts
│   └── api-context.tsx
└── messages/
    ├── de.json
    └── en.json
```

## 5. Conventions

### API Calls

- Page components must use the shared API context/client.
- Duplicate per-page `apiBaseUrl` and `apiRequest` implementations are disallowed.
- `AppWorkspace` loads `/v1/me` and derives navigation from the persisted role.
- The API token is held in React memory only; it is not persisted to browser storage.
- Request headers include `Authorization: Bearer <token>` only when a token is configured.

### Internationalization

- All user-facing text is stored in `messages/de.json` and `messages/en.json`.
- No hardcoded UI labels in page components.
- Domain terms should align with [`docs/design-docs/core-beliefs.md`](design-docs/core-beliefs.md).

### Accessibility

- Semantic labels for inputs and actions are required.
- Keyboard navigation must work for core workflows.
- Playwright + axe checks are part of acceptance coverage.

### Privacy and Visibility

- UI should only display data permitted by the authenticated role.
- API is the source of truth for access control; UI must avoid leaking restricted fields.
- Team calendar and reporting views must preserve privacy guardrails.

## 6. Current Implementation Status

- The current route surface uses a global role-aware workspace and session state.
- Approvals and closing use queue/detail layouts; secondary connection controls
  live in settings rather than repeated page panels.
- The light and dark themes share the Trusted Operations Desk tokens from
  [`../DESIGN.md`](../DESIGN.md).
- Unit, lint, typecheck, and production-build checks passed in the latest local
  snapshot. Database-backed Playwright verification remains environment-bound;
  see [`verification-baseline.md`](verification-baseline.md).

## 7. References

- [`docs/QUALITY_SCORE.md`](QUALITY_SCORE.md) — quality and accessibility targets
- [`docs/product-specs/new-user-onboarding.md`](product-specs/new-user-onboarding.md) — onboarding flow
- [`docs/product-specs/oncall-domain.md`](product-specs/oncall-domain.md) — on-call domain
- [`docs/product-specs/workflows-approvals.md`](product-specs/workflows-approvals.md) — approvals and workflows
