# Configuration

cueq reads runtime settings from environment variables. `make dev` explicitly
loads the repository-root `.env` with Node's environment-file parser. The API's
production command starts Node without an environment-file flag, so its
supervisor or platform must inject the environment. Next.js may load its own
standard environment files when the web application starts.

Copy `.env.example` for local development. Never commit a populated environment
file, token, credential, or encryption key.

## API and browser access

| Variable                 | Default                                              | Description                                                                                             |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               | unset                                                | Selects development, test, or production behavior. Production disables mock authentication and Swagger. |
| `DATABASE_URL`           | local scripts use PostgreSQL on `localhost:5433`     | Prisma connection URL                                                                                   |
| `PORT`                   | `3001`                                               | API port                                                                                                |
| `CUEQ_DEV_HOST`          | `127.0.0.1` outside production                       | Development bind address for the API and web app                                                        |
| `CUEQ_ENV_FILE`          | `.env`                                               | Environment file read by `make dev`                                                                     |
| `CORS_ORIGINS`           | local origins outside production; none in production | Comma-separated browser origins; `*` permits any origin                                                 |
| `CORS_ALLOW_CREDENTIALS` | `false`                                              | Enables credentialed CORS                                                                               |

Changing `CUEQ_DEV_HOST` does not change CORS. A production browser deployment
should list its exact origins. The API rejects `CORS_ORIGINS=*` together with
`CORS_ALLOW_CREDENTIALS=true`.

## Authentication

Set `AUTH_PROVIDER` to `mock`, `oidc`, or `saml`. Mock authentication is rejected
in production. If `AUTH_PROVIDER` is absent, the legacy `AUTH_MODE` setting is
used; it accepts `mock` or `oidc` and otherwise selects OIDC when an issuer URL
is present.

OIDC requires:

- `OIDC_ISSUER_URL`, the issuer whose JWKS verifies tokens;
- `OIDC_CLIENT_ID`, the required audience.

The SAML option expects a JWT from an external SAML bridge. cueq does not speak
the SAML protocol directly. Configure:

- `SAML_ISSUER`;
- `SAML_AUDIENCE`; and
- `SAML_JWT_SECRET`, the shared secret for HS256, HS384, or HS512 verification.

Local Compose has no identity provider. Use `AUTH_PROVIDER=mock` for local
evaluation or connect a separately managed issuer.

## HR and terminal integrations

| Variable                   | Default                                      | Description                                                  |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `TERMINAL_GATEWAY_TOKEN`   | `dev-terminal-token` in development and test | Token for terminal heartbeat and synchronization routes      |
| `HR_IMPORT_TOKEN`          | `dev-hr-token` in development and test       | Token for HR import routes                                   |
| `HR_PROVIDER_MODE`         | `stub`                                       | Selects the stub or `http` HR provider                       |
| `HR_MASTER_API_URL`        | unset                                        | URL for the HTTP HR provider                                 |
| `HR_MASTER_API_TOKEN`      | unset                                        | Optional bearer token sent to the provider                   |
| `HR_MASTER_API_TIMEOUT_MS` | `10000`                                      | Provider timeout, limited to 100 through 60,000 milliseconds |

Production has no fallback integration tokens. An HTTP provider URL may not
contain credentials and must use HTTPS in production.

`HONEYWELL_PROTOCOL` remains in the local template for compatibility, but the
application does not use it to select a protocol. Terminal CSV imports currently
use `HONEYWELL_CSV_V1`.

## Webhooks

Generate a local encryption key with `openssl rand -base64 32`. The result is
the canonical base64 form of the required 32-byte key.

| Variable                                 | Default           | Description                                                                     |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `WEBHOOK_SECRET_ENCRYPTION_KEY`          | none              | Active key used to encrypt signing secrets                                      |
| `WEBHOOK_SECRET_PREVIOUS_ENCRYPTION_KEY` | unset             | Old key available only during migration or rotation                             |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS`          | `false`           | Allows loopback, link-local, and private targets                                |
| `WEBHOOK_DISPATCH_BATCH_SIZE`            | `50`              | Most events claimed by one authorized dispatch                                  |
| `WEBHOOK_MAX_ATTEMPTS`                   | `5`               | Delivery attempt limit                                                          |
| `WEBHOOK_REQUEST_TIMEOUT_MS`             | `5000`            | Per-request timeout in milliseconds                                             |
| `WEBHOOK_CLAIM_LEASE_MS`                 | 15-minute minimum | Worker lease; never less than the internal minimum or twice the request timeout |

Keep private-target access disabled except in isolated test environments. Use
the key-rotation procedure in [Operations](OPERATIONS.md).

## Closing and reporting

| Variable                            | Default         | Description                                                             |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `CLOSING_AUTO_CUTOFF_ENABLED`       | `true`          | Enables the automatic cut-off transition                                |
| `CLOSING_ALLOW_MANUAL_REVIEW_START` | `false`         | Allows an emergency manual start of review                              |
| `CLOSING_CUTOFF_DAY`                | `3`             | Day of the next month, limited to 1 through 28                          |
| `CLOSING_CUTOFF_HOUR`               | `12`            | Local hour, limited to 0 through 23                                     |
| `CLOSING_TIMEZONE`                  | `Europe/Berlin` | IANA time zone; invalid values fall back to `Europe/Berlin`             |
| `CLOSING_BOOKING_GAP_MINUTES`       | `240`           | Booking-gap warning threshold; values below 30 use the default          |
| `CLOSING_BALANCE_ANOMALY_HOURS`     | `40`            | Absolute balance warning threshold; non-positive values use the default |
| `REPORT_MIN_GROUP_SIZE`             | `5`             | Minimum aggregate report group; values below 5 use 5                    |

## Private document storage

Document storage remains disabled until all required settings are present:

| Variable                   | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `DOCUMENT_STORAGE_ROOT`    | Absolute private directory outside public or static assets     |
| `DOCUMENT_ENCRYPTION_KEYS` | JSON object mapping key IDs to base64-encoded 32-byte AES keys |
| `DOCUMENT_ACTIVE_KEY_ID`   | Key ID used for new objects                                    |
| `DOCUMENT_REMINDER_DAYS`   | Expiry reminder horizon from 1 to 365 days; default `7`        |

Provide the directory and keys through protected deployment configuration. Do
not store keys beside objects, exports, public assets, or source code. When
rotating the active key, retain every older key still referenced by an object.

Uploads accept PDF, PNG, and JPEG files up to 10 MiB and compare the declared
MIME type with the file signature. An acknowledgement records a version, actor,
and timestamp; it is not a signature. Retention dates are metadata and do not
delete files.

## Personnel and reconciliation policy

Native HR access uses explicit capability grants created through
`/v1/hr/capability-grants`. Existing roles continue to govern time, leave,
roster, and closing features. Membership or a functional relationship does not
grant personnel access. The global `hr.reconcile` capability authorizes every
configured HR source and its outbound changes. Viewing native HR audit records
through the legacy audit browser also requires the corresponding global read
capability.

Employment groups and holiday calendars are immutable versions. Appointments
refer to those versions and snapshot their working schedule. The migrated TV-L
and NRW values are legacy reference configuration. Different leave terms need
an explicit `termChanges` calculation policy; cueq does not choose an
organization-specific policy automatically.

Generic reconciliation accepts at most 500 records per batch. Its CSV endpoint
accepts 65,536 characters and requires `personId`, `externalRecordId`,
`expectedSourceRevision`, and `revision`; supported personnel fields may appear
as optional columns. Blank field values are omitted, while a blank expected
revision means first import. Source identity and revision checks run in one
transaction, so a conflict rolls back the batch. An import cannot replace a
field owned by cueq or another source.

Legacy HR CSV and HTTP records may include `employmentStartDate` and
`employmentEndDate` in `YYYY-MM-DD` form. They initialize a newly imported
person and legacy appointment. Omitted dates remain unknown; dates supplied for
an existing person must match stored history. A new appointment cannot overlap a
locked closing period, but a start date after that period can add a later hire
without rewriting history.

Time-account preparation uses UTC accounting periods. Whole UTC days use the
configured daily schedule and holiday dates. A partial-day appointment boundary
requires `timeAccountTargetProration: "UTC_DAY_FRACTION"` in the term policy;
without it, preparation returns a policy-required conflict. The dashboard uses
Berlin dates, weekdays, and holidays independently of stored accounting periods.

## Command-line settings

| Variable                               | Default              | Description                                                          |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `SKIP_DOCKER`                          | `0`                  | Set to `1` to keep `make setup` from starting Compose                |
| `SKIP_INSTALL`                         | `0`                  | Set to `1` to skip the frozen install in setup                       |
| `POSTGRES_CLIENT_IMAGE`                | `postgres:16-alpine` | Client image for backup and restore verification                     |
| `WEBHOOK_SECRET_MAINTENANCE_CONFIRMED` | unset                | Must be `1` before applying webhook secret migration                 |
| `CUEQ_INCLUDE_SPECIALIZED_TESTS`       | unset                | Set to `1` to include specialized contract, policy, and domain tests |

## Production baseline

At minimum, the API needs `NODE_ENV=production`, a reachable `DATABASE_URL`, a
valid `WEBHOOK_SECRET_ENCRYPTION_KEY`, an OIDC or SAML-bridge provider, explicit
tokens for every machine integration in use, and exact CORS origins for browser
access.

The repository does not supply TLS termination, secret management, database or
backup encryption, retention automation, process supervision, monitoring, log
shipping, or deployment access control. These belong to the operator and target
platform.
