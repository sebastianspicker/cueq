# Alpha evaluation

Use cueq only in an isolated local environment with synthetic data. The
repository is not authorized for real employment data, production operations,
legal interpretation, or compliance certification.

## Prerequisites

Install Node.js 20.19.0 or later, pnpm 9.15.0, Docker with Compose, and GNU Make.
For browser tests, install the Chromium revision required by Playwright 1.58.2.

Create the local configuration:

```bash
cp .env.example .env
openssl rand -base64 32
```

Set the resulting value as `WEBHOOK_SECRET_ENCRYPTION_KEY` in `.env` and set
`AUTH_PROVIDER=mock`.

## Prepare the workspace

```bash
make setup
./scripts/pnpm.sh --filter @cueq/database db:seed:phase2
```

`make setup` installs the frozen dependency graph, attempts to start PostgreSQL
and Keycloak through Compose, generates the Prisma client, and applies committed
migrations. If Compose cannot start, setup continues against the configured
`DATABASE_URL`, and migration deployment must still succeed.

The local database is disposable. If this invocation starts Compose and
migration deployment fails, the setup script removes the cueq Compose volumes,
recreates the services, and retries once. `make clean` also removes the Compose
volumes. Do not use either command with data you need to retain.

## Start the applications

```bash
make dev
```

Open <http://localhost:3000/de/settings>. The default API is available at
<http://localhost:3001>, and the non-production OpenAPI UI is available at
<http://localhost:3001/api/docs>.

The settings page accepts an API base URL and bearer token. Keep the API base
URL at `/api` to use the web server rewrite. The token is stored in JavaScript
memory and is cleared when the page reloads.

With the phase-2 seed and mock authentication, these named tokens are accepted:

| Token            | Role            |
| ---------------- | --------------- |
| `employee-token` | Employee        |
| `lead-token`     | Team lead       |
| `planner-token`  | Roster planner  |
| `hr-token`       | Human resources |
| `admin-token`    | Administrator   |

These are local test credentials. Never replace them with institutional
credentials.

## Evaluate current flows

The localized interface includes:

- dashboard and bookings;
- leave balances, absence requests, and team calendar;
- rosters, plan-versus-actual data, and on-call work;
- approval inboxes and workflow administration;
- monthly closing and export preparation;
- aggregate reports and audit views;
- policy administration; and
- connection settings.

Role-conditioned navigation is a usability control. The API remains the
authorization boundary.

## Screenshot checks

Create the six synthetic browser captures with:

```bash
make demo-screenshots
```

This command builds the web application and runs the fixture-backed Playwright
lane. It validates the expected filenames before replacing the tracked images
under `docs/assets/screenshots/alpha/`. It does not exercise the API,
PostgreSQL, migrations, or CORS.

Run the database-backed screenshot lane separately:

```bash
docker compose up -d postgres
pnpm --filter @cueq/web test:demo-screenshots:database
```

That lane uses an isolated `web_demo_screenshots` schema and ports 3001 and 3310. It runs the built web server, API, Prisma, and synthetic seed, but uses
`prisma db push` rather than committed migration deployment. It writes
diagnostic output under `apps/web/test-results/demo-screenshots/database/` and
does not replace tracked screenshots.

Review the images for synthetic-only data, role visibility, stale labels,
clipping, loading states, and error states before publication. The expected set
is documented in [assets/screenshots/README.md](assets/screenshots/README.md).

## Verify the checkout

Start with:

```bash
make quick
make docs-check
make schemas
```

With PostgreSQL and Chromium available, run:

```bash
make check
make build
```

`make check` applies migrations and runs service-backed tests. A missing
database, browser, or system tool is an unavailable check, not a pass. See
[QUALITY_GATES.md](QUALITY_GATES.md) for the full sequence.

## Stop conditions

Stop the evaluation if:

- any fixture, screenshot, log, or export contains real personal data;
- the API is reachable from an untrusted network while mock authentication is
  enabled;
- a command would operate on a database or volume that must be retained;
- required authorization, privacy, or audit behavior cannot be verified; or
- the working tree no longer matches the source revision being evaluated.
