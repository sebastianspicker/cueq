# Security design

cueq handles workforce and absence data, including health-related information.
This document describes repository controls and known gaps. It is not a
data-protection impact assessment, legal approval, or production security
certification.

## Trust boundaries

The main boundaries are:

- the browser and Next.js application;
- the NestJS API;
- PostgreSQL;
- the identity provider or SAML bridge;
- terminal and HR clients using integration tokens;
- webhook destinations; and
- payroll export consumers.

The API is the authorization boundary. Role-conditioned navigation and hidden
UI fields do not grant or deny access.

TLS termination, network policy, database administration, disk encryption,
secret storage, backups, monitoring, and incident response are deployment
boundaries.

## Authentication

The API authenticates bearer tokens with one selected provider:

| Provider | Current behavior                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `mock`   | Accepts named or encoded local test tokens. Rejected when `NODE_ENV=production`.                                          |
| `oidc`   | Verifies issuer, audience, signature, and registered JWT claims through the issuer JWKS. Maps Keycloak-style realm roles. |
| `saml`   | Verifies an HMAC-signed JWT from an external SAML bridge. The API does not implement SAML.                                |

OIDC tokens must contain `sub` and `email`. The SAML bridge token must contain
`sub` and `email` and may contain a supported role. After token verification,
the API resolves the identity to a local person record and uses persisted role
and organization-unit data for application authorization.

The browser stores the current token in React memory. It does not implement a
login redirect, refresh token, server-side session, logout protocol, or
application revocation process.

Terminal and HR routes use `TERMINAL_GATEWAY_TOKEN` and `HR_IMPORT_TOKEN`.
Development and test mode have local fallbacks. Production mode requires
explicit values.

See [CONFIGURATION.md](CONFIGURATION.md) for provider settings.

## Authorization

Normal API routes pass through global authentication and role guards. Each
registered route must be:

- explicitly public;
- restricted by a non-empty role allowlist; or
- marked as authenticated when ownership or organization-unit checks occur in
  the service.

A metadata census test checks that registered handlers declare one of these
policies. Public machine routes still validate their integration token inside
the service.

The Prisma `Role` enum contains employee, team lead, planner, HR, payroll,
administrator, data-protection, and works-council roles. Access varies by
resource and action. Controllers declare coarse role access; services enforce
ownership, organization-unit, workflow, and closing-state constraints.

Changes to bookings, absence reasons, rosters, reports, audit data, exports,
policy administration, or closing flows require review of both controller and
service checks.

## Input and transport controls

- Zod schemas validate shared request and response shapes.
- DTO parsing and route-specific validation reject invalid identifiers and
  ranges.
- Prisma parameterizes database operations.
- API responses use Helmet headers.
- The web application sets content-type, frame, referrer, permissions, and
  legacy XSS headers.
- The web application does not currently set a Content Security Policy.
- Production CORS defaults to an empty browser-origin allowlist.
- `CORS_ORIGINS=*` cannot be combined with credentialed CORS.

## Sensitive data

Data classes include:

| Data                                 | Repository handling                                                              | Missing lifecycle control                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Time bookings                        | PostgreSQL storage and role-scoped API access                                    | Automated retention                                                                         |
| Absence records and reasons          | Role and organization-unit checks                                                | Automated retention, erasure, and pseudonymization                                          |
| Salary-relevant balances and exports | Role checks, export records, and audit events                                    | Provider acceptance and operator retention                                                  |
| Audit records                        | Append-only application writes and database rejection of row updates and deletes | Hash chaining, signatures, external witnessing, `TRUNCATE` protection, and pseudonymization |
| Aggregate reports                    | Minimum-group checks and role restrictions                                       | Institutional review of every report purpose and re-identification risk                     |

The current OpenAPI contract has no self-service personal-data export endpoint.
There is no automated erasure or retention workflow. The audit immutability
control also prevents in-place audit pseudonymization, so a future lifecycle
design must reconcile both requirements.

Only synthetic data belongs in fixtures, screenshots, logs, examples, issues,
and repository verification.

## Works-council and reporting constraints

Repository reporting is intended to avoid individual performance monitoring.
Aggregate reports enforce a minimum group size of five; a larger value can be
configured, but values below five fall back to five.

New or changed reports must be reviewed for:

- purpose and lawful basis;
- exposed fields and grouping dimensions;
- small-group and cross-filter re-identification;
- role and organization-unit visibility;
- audit coverage; and
- export retention.

Passing tests does not establish works-council or data-protection approval.

## Audit records

Application code appends audit entries for selected state changes and sensitive
reads. The migration
`packages/database/prisma/migrations/20260715090000_enforce_audit_entry_immutability/`
adds database triggers that reject row updates and deletes.

This boundary assumes the migration is applied and the database administrator
is trusted. It does not protect against:

- `TRUNCATE`;
- trigger removal;
- privileged database replacement;
- changes to backups;
- incomplete audit coverage; or
- edits outside the reviewed deployment.

Do not describe the audit table as cryptographically tamper-evident.

## Webhook secrets and outbound requests

Webhook signing secrets are returned when an endpoint is created and stored as
AES-256-GCM envelopes. The key comes from
`WEBHOOK_SECRET_ENCRYPTION_KEY`. The endpoint ID is authenticated as additional
data.

The API fails startup when the key is missing or invalid. Decryption and
configuration failures stop delivery rather than sending an unsigned request.
Key rotation uses the maintenance procedure in
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

Webhook target validation rejects unsupported protocols, embedded credentials,
and local or private targets by default. `WEBHOOK_ALLOW_PRIVATE_TARGETS=true`
exists for isolated testing and should not be enabled on a deployment without a
separate outbound-network review.

## Threat summary

| Threat                                       | Repository control                                                | Remaining boundary                                                     |
| -------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unauthorized absence access                  | Token verification, role guard, ownership and organization checks | Identity administration and complete deployed-path verification        |
| Audit modification                           | Database trigger rejecting row updates and deletes                | Privileged database actions and non-cryptographic evidence             |
| Terminal spoofing                            | Shared token and ingestion validation                             | Device identity, physical security, badge controls, and token rotation |
| Credential theft                             | JWT verification and memory-only browser token                    | Login, refresh, revocation, MFA, and browser hardening                 |
| SQL injection                                | Prisma operations and input validation                            | Raw query review and database privileges                               |
| Cross-site scripting                         | React escaping and security headers                               | No Content Security Policy; browser-token exposure remains possible    |
| Export exfiltration                          | Role checks and export audit records                              | Operator storage, delivery, access review, and retention               |
| Server-side request forgery through webhooks | URL validation and private-target rejection                       | DNS and outbound network policy at delivery time                       |

## Deployment requirements

A deployment assessment must cover:

- trusted HTTPS for the web application, API, identity provider, and HR
  provider;
- explicit CORS origins;
- least-privilege database accounts;
- encryption for database volumes and backups;
- secret storage and rotation;
- network egress restrictions;
- protected logs and export storage;
- backup restore testing;
- identity role mapping and deprovisioning;
- retention, access, erasure, and incident procedures; and
- independent authorization and privacy testing.

The repository does not provide or verify those controls.

## Vulnerability reporting

Do not open a public issue for a suspected vulnerability. Follow the private
reporting process in [../SECURITY.md](../SECURITY.md). Do not include
credentials, real personal data, private hostnames, or production logs.
