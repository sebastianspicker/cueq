# Configuration

cueq reads runtime configuration from environment variables. `make dev` loads
the repository-root `.env` with Node's environment-file parser. Set
`CUEQ_ENV_FILE` to use another readable file. Production start commands do not
load an environment file.

The committed `.env.example` is the local template. Do not commit populated
environment files, credentials, tokens, or encryption keys.

## Core runtime

| Variable                 | Default                                                                                          | Use                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               | unset                                                                                            | Selects development, test, or production behavior. Production disables mock authentication, local integration-token fallbacks, and the OpenAPI UI. |
| `DATABASE_URL`           | local scripts default to `postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public` | Prisma connection URL. Application start commands require a reachable PostgreSQL database.                                                         |
| `PORT`                   | `3001`                                                                                           | API listen port.                                                                                                                                   |
| `CUEQ_DEV_HOST`          | `127.0.0.1` outside production                                                                   | API and web development bind host. It does not change CORS policy.                                                                                 |
| `CUEQ_ENV_FILE`          | `.env`                                                                                           | Environment file selected by `make dev`.                                                                                                           |
| `CORS_ORIGINS`           | local origins outside production; empty in production                                            | Comma-separated browser origin allowlist. `*` enables all origins.                                                                                 |
| `CORS_ALLOW_CREDENTIALS` | `false`                                                                                          | Enables credentialed CORS requests when set to `true`. It cannot be combined with `CORS_ORIGINS=*`.                                                |

## Authentication

| Variable          | Default                                  | Use                                                                                    |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `AUTH_PROVIDER`   | compatibility selection described below  | Preferred provider selector: `mock`, `oidc`, or `saml`. Production rejects `mock`.     |
| `AUTH_MODE`       | mock unless an OIDC issuer is configured | Compatibility selector supporting `mock` or `oidc` when `AUTH_PROVIDER` is unset.      |
| `OIDC_ISSUER_URL` | unset                                    | OIDC issuer. The API reads signing keys from `<issuer>/protocol/openid-connect/certs`. |
| `OIDC_CLIENT_ID`  | unset                                    | Required OIDC audience.                                                                |
| `SAML_ISSUER`     | unset                                    | Required issuer for the SAML bridge JWT.                                               |
| `SAML_AUDIENCE`   | unset                                    | Required audience for the SAML bridge JWT.                                             |
| `SAML_JWT_SECRET` | unset                                    | Shared secret used to verify HS256, HS384, or HS512 bridge JWTs.                       |

The current SAML adapter verifies a JWT produced by an external SAML bridge. It
does not implement the SAML protocol in the API.

## Machine integrations

| Variable                   | Default                                          | Use                                                                                                    |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `TERMINAL_GATEWAY_TOKEN`   | `dev-terminal-token` only in development or test | Shared token for terminal heartbeat and sync routes. Required outside development and test.            |
| `HR_IMPORT_TOKEN`          | `dev-hr-token` only in development or test       | Shared token for HR import routes. Required outside development and test.                              |
| `HR_PROVIDER_MODE`         | `stub`                                           | HR master-data provider. Set to `http` to enable the HTTP adapter. Other values use the stub provider. |
| `HR_MASTER_API_URL`        | unset                                            | HTTP provider URL. Production requires HTTPS. Credentials in the URL are rejected.                     |
| `HR_MASTER_API_TOKEN`      | unset                                            | Optional bearer token sent to the HR master-data service.                                              |
| `HR_MASTER_API_TIMEOUT_MS` | `10000`                                          | HTTP request timeout, clamped to 100 through 60000 milliseconds.                                       |

## Webhooks

| Variable                                 | Default          | Use                                                                                                                |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `WEBHOOK_SECRET_ENCRYPTION_KEY`          | none             | Required base64 encoding of exactly 32 bytes. The API validates it before startup.                                 |
| `WEBHOOK_SECRET_PREVIOUS_ENCRYPTION_KEY` | unset            | Previous key used only by the webhook-secret migration during key rotation.                                        |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS`          | `false`          | Allows loopback, link-local, or private webhook targets when set to `true`. Keep disabled outside isolated tests.  |
| `WEBHOOK_DISPATCH_BATCH_SIZE`            | `50`             | Maximum events claimed per dispatch run. Invalid or non-positive values use the default.                           |
| `WEBHOOK_MAX_ATTEMPTS`                   | `5`              | Delivery attempt limit. Invalid or non-positive values use the default.                                            |
| `WEBHOOK_REQUEST_TIMEOUT_MS`             | `5000`           | Per-request timeout in milliseconds.                                                                               |
| `WEBHOOK_CLAIM_LEASE_MS`                 | internal minimum | Dispatcher claim lease. The effective value is never lower than the internal minimum or twice the request timeout. |

Create a local encryption key with:

```bash
openssl rand -base64 32
```

Webhook key rotation requires a maintenance window and the commands documented
in [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

## Closing and reporting

| Variable                            | Default         | Use                                                                                              |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `CLOSING_AUTO_CUTOFF_ENABLED`       | `true`          | Enables automatic transition into the cutoff workflow. `0`, `false`, `no`, and `off` disable it. |
| `CLOSING_ALLOW_MANUAL_REVIEW_START` | `false`         | Enables manual review start for accepted true-like values.                                       |
| `CLOSING_CUTOFF_DAY`                | `3`             | Day of the following month, clamped to 1 through 28.                                             |
| `CLOSING_CUTOFF_HOUR`               | `12`            | Local cutoff hour, clamped to 0 through 23.                                                      |
| `CLOSING_TIMEZONE`                  | `Europe/Berlin` | IANA time zone for cutoff calculations. Invalid values fall back to `Europe/Berlin`.             |
| `CLOSING_BOOKING_GAP_MINUTES`       | `240`           | Booking-gap warning threshold. Values below 30 use the default.                                  |
| `CLOSING_BALANCE_ANOMALY_HOURS`     | `40`            | Absolute balance warning threshold. Non-positive values use the default.                         |
| `REPORT_MIN_GROUP_SIZE`             | `5`             | Minimum aggregate-report group size. Values below 5 use 5.                                       |

## Verification and maintenance

These variables control repository tooling rather than normal application
behavior:

| Variable                               | Default              | Use                                                                                   |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `SKIP_DOCKER`                          | `0`                  | Prevents `make setup` from starting Compose when set to `1`.                          |
| `CI`                                   | unset                | Disables Playwright server reuse and identifies hosted execution to supporting tools. |
| `PW_REUSE_EXISTING_SERVER`             | `false`              | Allows local Playwright acceptance runs to reuse existing servers. Disabled in CI.    |
| `POSTGRES_CLIENT_IMAGE`                | `postgres:16-alpine` | PostgreSQL client image used by the backup and restore verifier.                      |
| `WEBHOOK_SECRET_MAINTENANCE_CONFIRMED` | unset                | Required as `1` by the Make target that applies webhook-secret migration.             |
| `CUEQ_DEMO_SCREENSHOT_DATA_SOURCE`     | fixture              | Selects the fixture or database screenshot lane.                                      |
| `CUEQ_DEMO_SCREENSHOT_BROWSER_NAME`    | harness-specific     | Selects a Playwright browser by name for screenshot verification.                     |
| `CUEQ_DEMO_SCREENSHOT_BROWSER_CHANNEL` | harness-specific     | Selects an installed browser channel.                                                 |
| `CUEQ_DEMO_SCREENSHOT_EXECUTABLE_PATH` | harness-specific     | Uses an explicit browser executable.                                                  |

## Production requirements

At minimum, a production-mode API process requires:

- `NODE_ENV=production`;
- a reachable `DATABASE_URL`;
- `WEBHOOK_SECRET_ENCRYPTION_KEY`;
- `AUTH_PROVIDER=oidc` with OIDC settings, or `AUTH_PROVIDER=saml` with bridge
  settings;
- `TERMINAL_GATEWAY_TOKEN` and `HR_IMPORT_TOKEN` when their routes are used; and
- an explicit `CORS_ORIGINS` allowlist for browser access.

The repository does not supply secret storage, TLS termination, database
encryption, backup retention, log redaction infrastructure, or deployment
access controls. Those must be provided and reviewed by the operator.
