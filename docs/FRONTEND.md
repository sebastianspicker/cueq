# FRONTEND.md — Frontend Architecture & Conventions

> For the overall system architecture, see [`ARCHITECTURE.md`](../ARCHITECTURE.md). For design patterns, see [`DESIGN.md`](DESIGN.md).

---

## 1. Overview

The cueq frontend is a web application providing self-service time tracking, leave management, roster viewing, and approval workflows. It serves multiple personas — from employees clocking in/out to HR managers running monthly closes.

### Key Requirements (from PRD)

- **Accessibility**: WCAG 2.1 AA target (best-effort in MVP; full compliance in Phase 2)
- **Internationalization**: DE (primary) and EN; all user-facing text externalized
- **Privacy-aware UI**: Absence reasons hidden from unauthorized roles; team calendar shows only "absent"

---

## 2. Tech Stack

> **TODO: confirm** — Final stack decision in ADR-001. The following is the assumed default.

| Concern | Assumed Choice | Rationale |
|---|---|---|
| Framework | React (or equivalent) | Component model, ecosystem, a11y tooling |
| Language | TypeScript (strict) | Type safety, shared types with backend |
| Styling | CSS Modules or Tailwind | Scoped styles, no global conflicts |
| i18n | Library TBD (e.g., react-intl, i18next) | Externalized strings, pluralization, date formatting |
| State | Server-state library (e.g., TanStack Query) | API-driven; minimize client-side state |
| Testing | Vitest + Testing Library + axe-core | Unit, component, a11y |

---

## 3. Key Views

| View | Primary Persona | Description |
|---|---|---|
| **Dashboard** | Employee | Today's Soll/Ist, running balance, quick actions (clock in/out, request leave) |
| **My Bookings** | Employee | List/calendar of own bookings; correction request flow |
| **Leave Request** | Employee | Submit leave; see remaining quota; conflict warnings |
| **Team Calendar** | Team Lead | Privacy-filtered absence overview; coverage indicators |
| **Roster View** | Shift Employee / Planner | Published shift plan; plan-vs-actual; swap request |
| **Approval Inbox** | Team Lead / HR | Pending requests with approve/reject; delegation indicator |
| **Monthly Closing** | HR / Team Lead | Checklist, missing items, approval, export trigger |
| **Admin / Config** | Admin | Roles, OE structure, rule sets, terminal status |

---

## 4. Conventions

### Component Structure

```
src/ui/
├── components/          # Reusable UI components (Button, Card, DataTable, etc.)
├── pages/               # Route-level page components
│   ├── dashboard/
│   ├── bookings/
│   ├── leave/
│   ├── roster/
│   ├── approvals/
│   ├── closing/
│   └── admin/
├── i18n/
│   ├── de.json          # German translations
│   └── en.json          # English translations
└── hooks/               # Shared React hooks (useAuth, useBookings, etc.)
```

### Naming

- Components: PascalCase (`BookingCard.tsx`)
- Hooks: camelCase with `use` prefix (`useLeaveBalance.ts`)
- Translation keys: dot-separated, snake_case (`dashboard.balance.current_month`)
- CSS classes: kebab-case or Tailwind utilities

### Accessibility

- Every interactive element has a visible label or `aria-label`.
- Color is never the sole indicator of state (use icons/text alongside).
- Keyboard navigation works for all core flows.
- `axe-core` runs in CI — no critical violations allowed.

### i18n Rules

- **No hardcoded strings** in components. All user-visible text uses translation keys.
- German is the primary locale; English is always provided.
- Dates, times, and numbers use `Intl` formatting with the user's locale.
- Domain terms follow the [glossary](design-docs/core-beliefs.md#domain-glossary).

---

## 5. Privacy in the UI

The UI enforces role-based visibility at the component level:

| Data | Employee | Team Lead | HR | Admin |
|---|---|---|---|---|
| Own bookings | ✅ | ✅ | ✅ | ✅ |
| Own balance | ✅ | ✅ | ✅ | ✅ |
| Team absence (reason) | ❌ | ✅ | ✅ | ❌ |
| Team absence (status only: "absent") | ✅ | ✅ | ✅ | ✅ |
| Others' bookings | ❌ | ❌ | ✅ (audit) | ❌ |
| Aggregated reports | ❌ | Team only | All | ❌ |

The API enforces these rules server-side; the UI reflects them via conditional rendering.

---

## 6. TODO: Confirm

- [ ] Final frontend framework selection (React? SolidJS? Other?)
- [ ] Design system / component library (build from scratch vs. adopt e.g. Radix, shadcn)
- [ ] Hosting: SPA with API backend, or SSR framework (Next.js, Remix)?
- [ ] Mobile-responsive design requirements for MVP

---

## 7. References

- [`DESIGN.md`](DESIGN.md) — Design patterns
- [`QUALITY_SCORE.md`](QUALITY_SCORE.md) — Testing targets including UI
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md) — Glossary and principles
- [`product-specs/new-user-onboarding.md`](product-specs/new-user-onboarding.md) — First user journey
