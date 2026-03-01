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
| Styling   | Shared global CSS + reusable components | Foundation-first approach, not a full design-system rewrite          |
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
│   ├── PageShell.tsx
│   ├── SectionCard.tsx
│   ├── ConnectionPanel.tsx
│   ├── StatusBanner.tsx
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
- Request headers must consistently include `Authorization: Bearer <token>` when token is configured.

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

## 6. MVP Implementation Status

- Core MVP views are implemented and integrated with API endpoints.
- Frontend architecture has moved from isolated page-local helpers to shared API/UI primitives.
- Deferred roadmap items (mobile-first experience, advanced design system migration) are intentionally out of this MVP baseline.

## 7. References

- [`docs/QUALITY_SCORE.md`](QUALITY_SCORE.md) — quality and accessibility targets
- [`docs/product-specs/new-user-onboarding.md`](product-specs/new-user-onboarding.md) — onboarding flow
- [`docs/product-specs/oncall-domain.md`](product-specs/oncall-domain.md) — on-call domain
- [`docs/product-specs/workflows-approvals.md`](product-specs/workflows-approvals.md) — approvals and workflows
