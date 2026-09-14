# Frontend

The cueq web application uses the Next.js 15 App Router, React 19,
`next-intl`, shared CSS, and runtime schemas from `@cueq/contracts`. It is built
and started separately from the API, but needs the API for application data.

## Routes and navigation

The root route redirects to a locale-prefixed route. German is the default;
English is also available. The current feature routes are:

| Route                     | Purpose                           |
| ------------------------- | --------------------------------- |
| `/[locale]/dashboard`     | Daily status and time totals      |
| `/[locale]/bookings`      | Time bookings                     |
| `/[locale]/leave`         | Leave balances and requests       |
| `/[locale]/team-calendar` | Team absence calendar             |
| `/[locale]/roster`        | Roster and shift planning         |
| `/[locale]/oncall`        | On-call rotations and deployments |
| `/[locale]/approvals`     | Workflow inbox and decisions      |
| `/[locale]/time-engine`   | Rule evaluation                   |
| `/[locale]/closing`       | Monthly closing                   |
| `/[locale]/reports`       | Aggregate and compliance reports  |
| `/[locale]/policy-admin`  | Policy administration             |
| `/[locale]/audit`         | Audit records                     |
| `/[locale]/personnel`     | Personnel records and changes     |
| `/[locale]/employment`    | Employment appointments and terms |
| `/[locale]/hr-admin`      | HR sources and capability grants  |
| `/[locale]/projects`      | Projects and time allocation      |
| `/[locale]/lifecycle`     | Onboarding and offboarding plans  |
| `/[locale]/tasks`         | Assigned lifecycle tasks          |
| `/[locale]/documents`     | Private document records          |
| `/[locale]/inbox`         | Notifications                     |
| `/[locale]/settings`      | API connection and preferences    |

The localized root, `/[locale]`, is the entry page for this route set.
Navigation follows the role returned by `/v1/me`, but the API makes every
authorization decision.

## Source layout

```text
apps/web/src/
  app/
    (redirect)/            root-to-locale redirect
    [locale]/              routes and route-specific components
    globals.css            shared stylesheet entry point
    globals-*.css          tokens, layout, features, and responsive rules
  components/              reusable controls and application shell
  i18n/                    locale request setup
  messages/de.json         German copy
  messages/en.json         English copy
  platform/browser/        browser preferences
  platform/http/           API context, requests, schemas, and URL policy
```

Keep a component beside its route when only that feature uses it. Move it to
`components` when several routes share the same behavior and semantics.

## API connection

The HTTP code under `platform/http` owns the browser-to-API boundary:

- the API base URL defaults to `/api` and is stored for the current browser
  session when changed;
- the bearer token stays in React state and is cleared when the endpoint
  changes;
- requests add an `Authorization` header only when a token is present;
- `/v1/me` resolves the current person, role, and organization context;
- response bodies use shared runtime schemas where a schema is defined;
- Next.js rewrites local `/api/:path*` requests to
  `http://localhost:3001/:path*`; and
- a direct browser connection must satisfy the API CORS policy and same-origin
  URL checks in the client.

This is a manual connection flow for local evaluation. It has no login
redirect, token refresh, logout, revocation, or server-managed browser session.

## Language, time, and styling

Put user-visible text in both message catalogs and keep their keys aligned.
German is the primary product vocabulary; the English catalog should preserve
the same meaning.

Always format dates and times with an explicit locale and the relevant time
zone. Closing defaults to `Europe/Berlin`, and domain calculations must not
silently depend on the browser's local zone.

`globals.css` and its imported `globals-*.css` files define the visual tokens,
typography, layout, focus treatment, themes, and responsive behavior.
[PRODUCT.md](../PRODUCT.md) describes the intended product character. Reuse
existing components and tokens when they fit the interaction.

The static demo under `docs/demo` reuses parts of the visual system, but it is a
separate HTML and JavaScript application with deterministic data. It does not
exercise the Next.js application or API.

## Accessibility and privacy

Frontend changes should preserve semantic labels, keyboard access, visible
focus, reduced-motion preferences, zoom, narrow-screen layouts, and status cues
that do not depend on color alone. Loading, empty, stale, error, disabled, and
success states should be explicit.

Do not render restricted data and hide it with CSS. Navigation and page content
should follow role and organization scope, while the API remains authoritative.
Review reports, absence reasons, audit data, and team information against
[SECURITY.md](SECURITY.md).

The repository has focused frontend tests but no committed browser end-to-end
suite. Browser behavior and WCAG conformance still require a running web client,
API, and PostgreSQL database, plus manual or automated browser checks.
