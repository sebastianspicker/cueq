# Operations runbook

This runbook covers repository-provided local and maintenance procedures. It is
not a deployment runbook for a specific institution.

Use synthetic data unless an approved deployment process defines a different
data boundary.

## Local services

Start PostgreSQL and Keycloak:

```bash
docker compose up -d
```

The Compose ports are loopback-bound:

| Service    | Address                 |
| ---------- | ----------------------- |
| PostgreSQL | `localhost:5433`        |
| Keycloak   | `http://localhost:8081` |

The committed credentials and Keycloak realm are synthetic development values.
Do not expose these services publicly or reuse their credentials.

Stop the services without removing data:

```bash
docker compose down
```

Remove the services and local database volume:

```bash
docker compose down -v
```

## Application startup

For development:

```bash
make dev
```

`make dev` requires a readable `.env` unless `CUEQ_ENV_FILE` selects another
file. By default it starts the API on port 3001 and the web application on port 3000. `PORT` overrides the API port.

For built processes:

```bash
make build
pnpm --filter @cueq/api start:prod
pnpm --filter @cueq/web start
```

The start commands do not load `.env`, apply migrations, configure TLS, or
supervise the processes. Inject all runtime settings explicitly. See
[CONFIGURATION.md](CONFIGURATION.md).

## Database migrations

Apply committed migrations:

```bash
pnpm --filter @cueq/database db:migrate:deploy
```

Create a development migration after changing the Prisma schema:

```bash
make db-migrate
```

Regenerate the Prisma client and contract artifacts:

```bash
make generate
make openapi-check
```

Do not use `make db-push` as a substitute for committed migration review. It is
a development schema synchronization command.

## Synthetic seeds

Load the phase-2 evaluation data:

```bash
pnpm --filter @cueq/database db:seed:phase2
```

Reset and reload that data:

```bash
pnpm --filter @cueq/database db:reset:phase2
```

Additional phase-3 and screenshot seeds are available through the
`@cueq/database` package scripts. They are test data, not migration fixtures.

## Health checks

Public liveness:

```bash
curl http://localhost:3001/health
```

The response proves that the API process is serving requests. It does not query
PostgreSQL.

Authenticated operational health:

```bash
curl \
  -H 'Authorization: Bearer <hr-or-admin-token>' \
  http://localhost:3001/health/ready
```

This route reads operational records for terminals, HR imports, exports, and
backup verification. It returns `ok` or `degraded` with HTTP 200.

Terminal integration health:

```bash
curl \
  -H 'x-integration-token: <terminal-integration-token>' \
  http://localhost:3001/v1/terminal/health
```

Use deployment-specific probes and alert rules. The repository does not provide
a metrics endpoint or alert delivery.

## Authentication modes

Local evaluation uses:

```dotenv
AUTH_PROVIDER=mock
```

Production mode rejects mock authentication. Use either:

```dotenv
AUTH_PROVIDER=oidc
OIDC_ISSUER_URL=https://identity.example.invalid/realms/cueq
OIDC_CLIENT_ID=cueq
```

or a configured external SAML bridge:

```dotenv
AUTH_PROVIDER=saml
SAML_ISSUER=<bridge-issuer>
SAML_AUDIENCE=<bridge-audience>
SAML_JWT_SECRET=<deployment-secret>
```

The API SAML adapter verifies bridge JWTs. It does not implement the SAML
protocol.

## Terminal and HR integration tokens

Terminal heartbeat and sync routes require `TERMINAL_GATEWAY_TOKEN`. HR import
routes require `HR_IMPORT_TOKEN`. Development and test mode have local fallback
values; production mode does not.

Inject distinct random values through the deployment secret system. Rotate them
with a coordinated client and server change. Do not put tokens in URLs, logs,
fixtures, screenshots, issues, or command history.

The terminal CSV protocol identifier in source is `HONEYWELL_CSV_V1`.

## HR master-data provider

`HR_PROVIDER_MODE=stub` uses the local stub provider.

`HR_PROVIDER_MODE=http` enables the HTTP provider and requires
`HR_MASTER_API_URL`. Production mode requires an HTTPS URL. The URL must not
contain credentials. `HR_MASTER_API_TOKEN` adds an optional bearer token, and
`HR_MASTER_API_TIMEOUT_MS` controls the bounded request timeout.

The provider validates response shape before records enter the import pipeline.
HTTP status, transport, and schema failures are reported as service errors.

## Webhook signing keys

The API requires `WEBHOOK_SECRET_ENCRYPTION_KEY`, a canonical base64 encoding
of exactly 32 bytes. It encrypts stored webhook signing secrets with
AES-256-GCM and binds each envelope to its endpoint ID.

Check current rows without changing them:

```bash
make webhook-secrets-check
```

Before applying a legacy-row migration or key rotation:

1. stop old API and dispatcher processes;
2. drain webhook dispatch and database traffic;
3. create and verify a database backup;
4. inject the new `WEBHOOK_SECRET_ENCRYPTION_KEY`;
5. inject the old key as `WEBHOOK_SECRET_PREVIOUS_ENCRYPTION_KEY` when rotating;
6. run the count-only check; and
7. review the result before applying changes.

Apply the transactional migration only during the confirmed maintenance
window:

```bash
WEBHOOK_SECRET_MAINTENANCE_CONFIRMED=1 make webhook-secrets-migrate
```

Run `make webhook-secrets-check` again before restarting the new processes. The
migration validates rows before writing, aborts on unknown state, and does not
print secret material.

## Closing and payroll export

Closing defaults are documented in [CONFIGURATION.md](CONFIGURATION.md).
Operationally significant settings include the cutoff day, hour, time zone,
booking-gap threshold, balance-anomaly threshold, and manual review switch.

Closing state and post-close corrections are controlled by API role checks and
database transactions. Export runs are recorded before their artifacts are
downloaded. A successful local export does not establish acceptance by a
payroll provider.

Review changes to closing defaults with HR, payroll, privacy, and works-council
owners before deployment.

## Backup and restore verification

Run:

```bash
make test-backup-restore
```

The verifier creates a custom-format PostgreSQL dump, restores it into an
isolated temporary database, compares table counts and content checksums, and
records successful verification in the audit table.

The command requires a reachable PostgreSQL database and either local
PostgreSQL client tools or the configured `POSTGRES_CLIENT_IMAGE`.

The scheduled GitHub Actions workflow
`.github/workflows/backup-restore-weekly.yml` runs the drill against synthetic
data. It does not configure production backup retention, off-site storage, WAL
archiving, or recovery objectives.

## Diagnostics

### Database connection failures

Prisma `P1001` means the configured database is unreachable.

```bash
docker compose ps
docker compose logs postgres
```

Confirm the host, port, credentials, database name, and schema in
`DATABASE_URL`.

### Migration failures during setup

If `make setup` started Compose and migration deployment fails, it removes the
cueq Compose volumes and retries once. Recover required data before rerunning.
For a non-disposable database, run the migration command directly and inspect
the Prisma error without invoking the setup reset path.

### API startup failure

Check:

- `DATABASE_URL`;
- `WEBHOOK_SECRET_ENCRYPTION_KEY`;
- the authentication provider and its required settings;
- production integration tokens; and
- `CORS_ORIGINS` for browser access.

The API intentionally fails closed for invalid webhook-key and production mock
authentication configuration.

### Browser cannot reach the API

The local web application expects `/api` and rewrites it to
`http://localhost:3001`. For direct browser access to the API, add the exact web
origin to `CORS_ORIGINS`. Changing `CUEQ_DEV_HOST` does not update CORS.

### TypeScript or dependency mismatch

Reinstall the pinned graph:

```bash
./scripts/pnpm.sh install --frozen-lockfile
make typecheck
```

The repository verifies both the native TypeScript compiler package and the
compatibility compiler used by current tooling.

## Incident boundary

The repository contains no paging, escalation, communication, or recovery-time
policy. A deployment owner must define those procedures and must control access
to logs, exports, backups, secrets, and database administration.

Security reports follow [../SECURITY.md](../SECURITY.md).
