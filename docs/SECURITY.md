# Security model

cueq handles workforce and absence data, including health-related information.
This page explains the controls implemented in the repository and the security
work that belongs to a deployment. It does not replace an organization-specific
security or data-protection assessment.

Report suspected vulnerabilities through the private process in
[the repository security policy](../SECURITY.md). Do not put credentials,
personal data, private hostnames, or production logs in a public issue.

## System boundaries

The main trust boundaries are the browser and Next.js application, the NestJS
API, PostgreSQL, the identity provider or SAML bridge, terminal and HR clients,
webhook destinations, and payroll export consumers.

The API makes authorization decisions. Hiding navigation or fields in the web
application is only a presentation choice. TLS termination, network policy,
database administration, disk encryption, secrets, backups, monitoring, and
incident response must be provided by the deployment environment.

## Authentication

The API selects one bearer-token provider:

- `mock` accepts named or encoded local tokens and is rejected when
  `NODE_ENV=production`.
- `oidc` verifies issuer, audience, signature, and registered JWT claims against
  the issuer JWKS. It maps Keycloak-style realm roles.
- `saml` verifies an HMAC-signed JWT issued by an external SAML bridge. cueq does
  not implement the SAML protocol itself.

OIDC and bridge tokens require `sub` and `email`. After verifying the token, the
API resolves it to a local person and authorizes requests from the persisted
role and organization-unit data.

The browser holds the current token in React memory. It has no login redirect,
refresh-token flow, server-side session, logout protocol, or application-level
revocation. Terminal and HR routes use `TERMINAL_GATEWAY_TOKEN` and
`HR_IMPORT_TOKEN`; production has no fallback values. Provider settings are
documented in [Configuration](CONFIGURATION.md).

## Authorization

Global authentication and role guards cover normal API routes. Every registered
handler must declare itself public, provide a non-empty role allowlist, or mark
itself authenticated so the service can apply ownership or organization checks.
A census test enforces this metadata rule. Public machine endpoints still check
their integration token in the service.

The database defines employee, team-lead, planner, HR, payroll, administrator,
data-protection, and works-council roles. Controllers apply broad role access;
services enforce ownership, organization unit, workflow state, and closing
state. Changes involving bookings, absence reasons, rosters, reports, audits,
exports, policy administration, or closing must review both layers.

Native personnel functions add explicit capability grants. Organizational
membership and functional relationships do not grant personnel access. The
global `hr.reconcile` capability allows all configured HR sources and their
outbound changes, so it should be assigned sparingly.

## Requests and browser controls

- Zod schemas validate shared request and response shapes, while DTO and route
  validation reject invalid identifiers and ranges.
- Prisma parameterizes database operations.
- The API uses Helmet response headers.
- The web application sets content-type, frame, referrer, permissions, and
  legacy XSS headers.
- Localized pages receive a request nonce and an enforced Content Security
  Policy. Production blocks `eval` and inline scripts without that nonce. Inline
  styles remain allowed because current React views use style attributes.
- Production CORS starts with an empty origin allowlist. `CORS_ORIGINS=*` cannot
  be combined with `CORS_ALLOW_CREDENTIALS=true`.

## Personal and sensitive data

Time bookings, absences, salary-relevant balances, exports, audit events, and
aggregate reports are stored in PostgreSQL and exposed through role- and
scope-checked APIs. Aggregate reports enforce a minimum group size of five;
operators may raise it, but lower values fall back to five.

The repository does not automate retention, erasure, pseudonymization, or
self-service personal-data export. Export retention and payroll-provider
acceptance also remain operational responsibilities. Any new report needs a
review of its purpose, fields, grouping dimensions, small-group and cross-filter
re-identification risk, role and organization scope, audit coverage, and export
retention.

Only synthetic data may appear in seeds, screenshots, logs, examples, issues,
and repository test runs.

## Audit records

Application code appends audit entries for selected state changes and sensitive
reads. The migration
`packages/database/prisma/migrations/20260715090000_enforce_audit_entry_immutability/`
installs database triggers that reject updates and deletes of audit rows.

This protection depends on the migration being applied and on a trusted database
administrator. It does not prevent `TRUNCATE`, trigger removal, privileged
database replacement, backup modification, incomplete application coverage, or
changes outside the reviewed deployment. The audit table is therefore not a
cryptographically tamper-evident record. Its immutability also means a future
pseudonymization design must reconcile audit history with data-lifecycle needs.

## Webhooks and outbound requests

When an endpoint is created, its signing secret is returned once and stored in
an AES-256-GCM envelope. `WEBHOOK_SECRET_ENCRYPTION_KEY` supplies the key, and
the endpoint ID is authenticated as additional data. A missing or invalid key
stops API startup. Decryption or configuration failures stop delivery instead
of sending an unsigned request.

Targets must use a supported protocol and may not contain embedded credentials.
Local and private addresses are rejected by default. Enabling
`WEBHOOK_ALLOW_PRIVATE_TARGETS=true` is intended for isolated testing and needs
a separate outbound-network review in any deployment. DNS and egress policy
must still protect against address changes between validation and delivery.

Follow [the operations procedure](OPERATIONS.md) when rotating webhook keys.

## Machine integrations and exports

Terminal and HR clients authenticate with shared tokens. Those tokens do not
establish device identity, badge-holder identity, physical security, or a token
rotation process; the deployment must provide those controls. Import validation
limits the data accepted by the application but does not make an external source
trusted.

Payroll exports use role checks and create audit records. Their storage,
delivery, downstream access, retention, and provider acceptance remain outside
cueq.

## Private documents

Configured document storage encrypts PDF, PNG, and JPEG objects with AES keys
supplied outside the repository. Uploads are limited to 10 MiB and the declared
MIME type is checked against the file signature. Acknowledgements record the
document version, actor, and time; they are not digital signatures. Retention
dates are metadata and do not delete files.

Back up the database, encrypted objects, and encryption keys through separate
protected channels. Keep every key still referenced by an object. The repository
can verify database and object consistency, but key custody and restoration stay
with the operator.

## Deployment checklist

Before handling real data, the deployment owner should review:

- trusted HTTPS for the web app, API, identity provider, and HR provider;
- explicit CORS origins and restricted network egress;
- least-privilege database accounts and encrypted database and backup storage;
- secret storage, rotation, and deprovisioning;
- protected logs and exports;
- backup restoration and recovery objectives;
- identity role mapping and access reviews;
- retention, access, erasure, and incident procedures; and
- independent authorization, privacy, and accessibility testing.

These controls depend on the target environment and are not supplied or verified
by this repository.
