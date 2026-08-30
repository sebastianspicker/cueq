# Frontend

The cueq web application is a Next.js 15 App Router application using React 19,
`next-intl`, shared CSS, and direct runtime contracts.

## Routes

The root route redirects into the locale segment. German is the default locale
and English is also available.

Current localized routes under `apps/web/src/app/[locale]/`:

| Route                     | Surface                                |
| ------------------------- | -------------------------------------- |
| `/[locale]`               | Localized entry page                   |
| `/[locale]/dashboard`     | Employee status and daily ledger       |
| `/[locale]/bookings`      | Time bookings                          |
| `/[locale]/team-calendar` | Team absence calendar                  |
| `/[locale]/leave`         | Leave balances and requests            |
| `/[locale]/roster`        | Roster and shift planning              |
| `/[locale]/approvals`     | Workflow inbox                         |
| `/[locale]/time-engine`   | Rule evaluation                        |
| `/[locale]/closing`       | Monthly closing workspace              |
| `/[locale]/reports`       | Aggregate and compliance reports       |
| `/[locale]/oncall`        | On-call rotations and deployments      |
| `/[locale]/policy-admin`  | Policy administration                  |
| `/[locale]/audit`         | Audit records                          |
| `/[locale]/settings`      | API connection and display preferences |

Navigation is conditioned on the role returned by `/v1/me`. The API remains the
authorization boundary.

## Source layout

```text
apps/web/src/
  app/
    (redirect)/
    [locale]/
    globals.css
  components/
    workspace/
  i18n/
  platform/
    http/
  messages/
    de.json
    en.json
```

`AppWorkspace` owns the shared application shell and API connection. Reusable
status, form, page, and workspace components live under `components/`.
Feature-specific sections remain next to their route when they are not shared.

## API access

Page code uses the shared API context and client in
`apps/web/src/platform/http/`.

- The browser token is held in React memory and is not persisted to local or
  session storage.
- The client adds `Authorization: Bearer <token>` only when a token is set.
- `AppWorkspace` requests `/v1/me` to resolve the current identity and role.
- During local development, the Next.js rewrite forwards `/api/:path*` to
  `http://localhost:3001/:path*`.
- Direct browser access to the API must use an origin allowed by
  `CORS_ORIGINS`.

The current browser connection is suitable for local evaluation, not a complete
SSO or session implementation.

## Localization

User-visible copy belongs in `apps/web/src/messages/de.json` and
`apps/web/src/messages/en.json`. Keep message keys aligned between the two
files. German terminology is the primary product vocabulary.

Dates and times must use explicit locale and time-zone handling. Operational
closing defaults use `Europe/Berlin`; do not rely on the browser's implicit
zone for domain calculations.

## Styling

`apps/web/src/app/globals.css` is the shared token and layout authority.
Feature-local classes should represent a feature state, interaction, or
responsive requirement rather than duplicate global tokens.

The reusable component set includes page shells, cards, form fields, status
banners, status badges, loading indicators, icons, and workspace navigation.
Use an existing component when it represents the same behavior and semantics.

The visual terminology is documented in [BRAND.md](BRAND.md). The implemented
tokens are defined in `apps/web/src/app/globals.css`.

## Accessibility and privacy

- Use semantic labels and programmatic names for controls.
- Preserve keyboard access and visible focus states.
- Represent loading, empty, error, disabled, and success states explicitly.
- Keep restricted values out of rendered markup, not only out of visible
  layout.
- Preserve role visibility rules in navigation and page content.
- Treat axe checks as one gate, not complete accessibility evidence.

Changes to reports, absence details, audit records, or team data require review
against [SECURITY.md](SECURITY.md).

## Verification

The web application is typechecked and built by repository-wide commands.
There is no committed browser end-to-end suite in the current source tree;
browser behavior needs a separately run browser, API, and PostgreSQL lane.
