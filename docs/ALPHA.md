# Alpha evaluation

Use cueq only in an isolated local environment with synthetic data. The
repository is not authorized for real employment data, production operations,
legal interpretation, or compliance certification.

## Prerequisites

Install Node.js 22.13.0 or later, pnpm 11.24.0, Docker with Compose, and GNU Make.

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
./scripts/pnpm.sh --filter @cueq/database db:seed:demo
```

`make setup` installs the frozen dependency graph, attempts to start PostgreSQL
through Compose, generates the Prisma client, and applies committed migrations.
If Compose cannot start, setup continues against the configured `DATABASE_URL`,
and migration deployment must still succeed.

Setup and normal cleanup never remove database volumes. `make clean` removes
build artifacts only. Deleting local Compose data is a separate, explicitly
confirmed maintenance operation; do not use it with data you need to retain.

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

With the current synthetic seed and mock authentication, these named tokens are accepted:

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

## Screenshot review

The tracked screenshots are static, sanitized examples. Review their data and
role labels manually before publication; they do not provide runtime evidence.

## Verify the checkout

Start with:

```bash
make quick
make docs-check
make schemas
```

With PostgreSQL available, run:

```bash
make check
make build
```

`make check` applies migrations and runs service-backed tests. A missing
database, browser, or system tool is an unavailable check, not a pass. See
[QUALITY_GATES.md](QUALITY_GATES.md) for the full sequence.

## Stop conditions

Stop the evaluation if:

- any seed data, screenshot, log, or export contains real personal data;
- the API is reachable from an untrusted network while mock authentication is
  enabled;
- a command would operate on a database or volume that must be retained;
- required authorization, privacy, or audit behavior cannot be verified; or
- the working tree no longer matches the source revision being evaluated.
