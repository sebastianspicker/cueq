# Operations

This guide covers the maintenance commands included in the repository. A real
deployment still needs its own process supervision, secrets, monitoring,
incident response, backup retention, and rollback procedures.

## Run PostgreSQL locally

```bash
docker compose up -d
docker compose ps
```

Compose runs PostgreSQL 16 at `127.0.0.1:5433` with development credentials and
does not include an identity provider. Stop it without deleting its volume:

```bash
docker compose down
```

To remove the local volume, first confirm the `DATABASE_URL` and Compose project,
then use the guarded command:

```bash
CUEQ_DELETE_LOCAL_DATA=DELETE_LOCAL_DATA make clean-local-data
```

This permanently deletes the selected Compose data. Never use it for a database
that must be retained.

## Start built applications

Development uses `make dev`. To run compiled applications, start the API and web
commands in separate terminals or supervised processes:

```bash
make build
./scripts/pnpm.sh --filter @cueq/api start:prod
./scripts/pnpm.sh --filter @cueq/web start
```

The API command starts Node without an environment-file flag. Next.js may load
its standard environment files when the web process starts. Neither command
applies migrations, terminates TLS, supervises the other process, or provides
rollback. Supply the intended runtime environment and manage those concerns in
the deployment platform.

## Apply migrations and load synthetic data

Apply migrations that are already committed:

```bash
./scripts/pnpm.sh --filter @cueq/database db:migrate:deploy
```

After changing Prisma locally, create and review a migration before regenerating
contracts:

```bash
make db-migrate
make generate
make openapi-check
```

Do not replace migration review with `make db-push`. The following commands load
or replace the selected synthetic dataset; they are not schema migrations:

```bash
./scripts/pnpm.sh --filter @cueq/database db:seed:baseline
./scripts/pnpm.sh --filter @cueq/database db:reset:baseline
./scripts/pnpm.sh --filter @cueq/database db:seed:demo
./scripts/pnpm.sh --filter @cueq/database db:reset:demo
```

## Check service health

The public liveness endpoint confirms that the API process can answer:

```bash
curl http://localhost:3001/health
```

HR users and administrators can inspect operational state with an authenticated
request:

```bash
curl -H 'Authorization: Bearer <token>' http://localhost:3001/health/ready
```

Readiness queries PostgreSQL for terminal, HR import, export, and recorded
backup/restore status. It returns HTTP 200 with `ok` or `degraded`; it is not a
dedicated database-connectivity probe.

Terminal integration health uses its own shared token:

```bash
curl -H 'x-integration-token: <token>' http://localhost:3001/v1/terminal/health
```

The repository does not expose metrics, traces, dashboards, log shipping, or
alert delivery.

## Import HR and terminal data

Terminal heartbeat and batch endpoints require `TERMINAL_GATEWAY_TOKEN`. HR
import endpoints require `HR_IMPORT_TOKEN`. Production has no fallback values.

The database package includes a transactional CSV importer. Build the database
workspace first, then run it against the intended database:

```bash
./scripts/pnpm.sh --filter @cueq/database build
node scripts/hr-import.mjs --file /absolute/path/to/synthetic-people.csv
```

`--source-file <label>` changes the source label recorded with the import.
Relative input paths resolve from `packages/database`, where the wrapper runs.
The command validates the whole file before writing, takes an advisory lock, and
records an `HrImportRun`.

Set `HR_PROVIDER_MODE=http` to use the configured master-data service through the
API. The operator remains responsible for provider acceptance, scheduling, and
production credentials.

## Dispatch webhooks

HR users and administrators can create endpoints and inspect outbox and delivery
state. Only administrators can request a dispatch:

```text
POST /v1/integrations/webhooks/dispatch
GET  /v1/integrations/webhooks/dispatch-jobs/:id
```

The POST returns HTTP 202 with `{jobId,status}`. Poll the GET endpoint for state,
counters, timestamps, and sanitized failure codes.

One request snapshots at most `WEBHOOK_DISPATCH_BATCH_SIZE` eligible events in
creation and ID order. A concurrent request receives the active job. The API
polls existing jobs at startup and every 30 seconds, but new outbox entries do
not create a job by themselves. Events are processed in order for each endpoint;
independent endpoints run in waves of eight. Leases and worker generations allow
an interrupted batch to be reclaimed without two workers finalizing it.

`SUCCEEDED` means the finite batch finished, including any delivery or
configuration failures recorded for its items. Delayed retries need another
administrator dispatch. Delivery is at least once, so a receiver may see the
same event after a crash between its response and database finalization. Use the
event ID for deduplication. During recovery, leave job and item records in place;
expired leases are reclaimed automatically.

## Rotate webhook encryption keys

Inspect stored secret state without changing rows:

```bash
make webhook-secrets-check
```

Before a legacy-secret migration or key rotation:

1. Stop old API and dispatcher instances.
2. Prevent new dispatch requests and drain database writes.
3. Verify a current backup.
4. Inject the new `WEBHOOK_SECRET_ENCRYPTION_KEY`.
5. During rotation, provide the old key as
   `WEBHOOK_SECRET_PREVIOUS_ENCRYPTION_KEY`.

Then run:

```bash
WEBHOOK_SECRET_MAINTENANCE_CONFIRMED=1 make webhook-secrets-migrate
make webhook-secrets-check
```

The migration validates every row before applying changes in one transaction
and does not print secret material.

## Closing and exports

The API checks closing cut-off and workflow escalation every hour. Closing
writes use role checks, period locks, and transactions. Export activity and
downloads are audited, but creating an artifact does not mean a payroll provider
accepted it. Review closing configuration and export handling with the
responsible HR, payroll, privacy, and employee-representation owners before
deployment.

## Verify backup and restore

The supplied drill runs `pg_dump`, restores into a temporary database, compares
table counts and checksums, drops that database, and records a successful result
in the source audit table. It needs Docker, access to the PostgreSQL server,
permission to create and drop a database, and known non-empty person and audit
data.

After Prisma generation, build the database workspace and run:

```bash
./scripts/pnpm.sh --filter @cueq/database build
node scripts/backup-restore-verify.mjs --json
```

`POSTGRES_CLIENT_IMAGE` selects the PostgreSQL client image. Run the drill only
against an approved source database.

Report format 3 visits every generated Prisma model in ID-ordered pages of 500
inside a repeatable-read snapshot and hashes canonical records incrementally. It
stores counts and hashes, not full row data, and cannot be compared with format
1 or 2 reports. When private documents are configured, the report also contains
an encrypted-object manifest. The drill decrypts and checks each object, copies
its encrypted bytes to a separate private directory, and verifies the restored
records against that copy. Missing objects, keys, or matching checksums fail the
run.

This tool does not schedule backups or define retention, off-site storage, WAL
archiving, recovery time, or recovery point objectives.

## Recover private document uploads

An upload records a durable intent before writing encrypted bytes. The document
version and committed intent are finalized in one database transaction, so a
lost response does not cause immediate deletion.

The API checks pending uploads older than 24 hours at startup and every 30
seconds, 100 at a time. Recovery locks the same intent row used by finalization,
keeps objects referenced by committed versions, and commits a failed intent
before deleting abandoned bytes. Missing paths remain eligible for retry, which
protects a delayed writer from leaving an untracked object. Storage errors leave
cleanup pending and produce a sanitized warning.

Back up the database, encrypted objects, and encryption keys through separate
protected channels. The restore drill checks database and object consistency;
the operator owns key custody and restoration. Document retention is
non-destructive by default.

## Troubleshooting

A Prisma `P1001` error means the configured database cannot be reached:

```bash
docker compose ps
docker compose logs postgres
```

For dependency or compiler mismatches, reinstall the lockfile graph and verify
the toolchain:

```bash
./scripts/pnpm.sh install --frozen-lockfile
./scripts/pnpm.sh toolchain:verify
```

API startup fails deliberately for an invalid webhook key, mock authentication
in production, unsupported provider settings, or missing required credentials.
Browser requests through `/api` use the local rewrite; direct browser origins
must appear in `CORS_ORIGINS`. See [Security](SECURITY.md) before operating with
real data.
