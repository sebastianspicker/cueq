# SECURITY.md — Security Design

---

## 1. Security Principles

1. **Defense in depth.** Multiple layers: network (TLS), authentication (SSO), authorization (RBAC), data (encryption at rest), audit (append-only log).
2. **Least privilege.** Every role has the minimum access required. Default is deny.
3. **No secrets in the repo.** `.env.example` for templates; real credentials via secure injection only.
4. **No telemetry.** No analytics, tracking pixels, third-party scripts, or phone-home behavior.
5. **Assume breach.** Audit trail enables forensic reconstruction; immutable logs cannot be tampered with.

---

## 2. Authentication

| Aspect             | Design                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Protocol           | SAML 2.0 or OIDC (configurable)                                                          |
| Identity provider  | University IdM (AD / Azure AD / Keycloak)                                                |
| Session management | Signed tokens (JWT) with short expiry + refresh; or server-side sessions                 |
| Multi-factor       | Deferred to IdP configuration (university controls MFA policy)                           |
| Service accounts   | Separate credentials for terminal gateway and HR import; scoped to minimal permissions   |
| Integration tokens | `TERMINAL_GATEWAY_TOKEN` and `HR_IMPORT_TOKEN` required for machine-to-machine endpoints |

Runtime selector:

- `AUTH_PROVIDER=mock|oidc|saml` (preferred)
- `AUTH_MODE` remains supported as backward-compatible fallback

SAML adapter settings:

- `SAML_ISSUER`
- `SAML_AUDIENCE`
- `SAML_JWT_SECRET`

---

## 3. Authorization (Role-Based Access Control)

### Roles

| Role                            | Access Level                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `Mitarbeitende` (Employee)      | Own bookings, own balance, own leave, team absence view ("absent" only)            |
| `Teamleitung` (Team Lead)       | Team bookings (read), approvals, team absence (with reason), team reports          |
| `Dienstplaner` (Shift Planner)  | Roster planning for assigned OEs, shift swap approvals                             |
| `HR` (Personalstelle)           | All bookings (read/correct), rule configuration, monthly closing, cross-OE reports |
| `Payroll` (Bezügestelle)        | Export artifacts (read/download); no export trigger rights                         |
| `Admin`                         | System configuration, role management, terminal management, monitoring             |
| `Datenschutz` (Data Protection) | Audit trail (read), GDPR reports                                                   |
| `Personalrat` (Works Council)   | Aggregated reports only (no individual data); configurable read access             |

### Permission Matrix

| Resource                         | Employee | Lead     | Planner         | HR                  | Payroll | Admin | PR        |
| -------------------------------- | -------- | -------- | --------------- | ------------------- | ------- | ----- | --------- |
| Own bookings                     | RW       | R        | —               | RW                  | —       | —     | —         |
| Team bookings                    | —        | R        | R               | RW                  | —       | —     | —         |
| Absence reason                   | —        | R (team) | —               | R (all)             | —       | —     | —         |
| Absence status                   | R (team) | R (team) | R (assigned)    | R (all)             | —       | —     | —         |
| Roster                           | R        | R        | RW              | R                   | —       | —     | —         |
| Approvals                        | Submit   | Decide   | Decide (shifts) | Decide (post-close) | —       | —     | —         |
| Reports (individual)             | Own      | Team     | —               | All                 | —       | —     | —         |
| Reports (aggregate)              | —        | Team     | —               | All                 | —       | —     | Agg. only |
| Audit/compliance summary reports | —        | —        | —               | R                   | —       | R     | R         |
| Payroll CSV download             | —        | —        | —               | R                   | R       | R     | —         |
| Audit trail                      | —        | —        | —               | R                   | —       | R     | R         |
| System config                    | —        | —        | —               | —                   | —       | RW    | —         |

**Key**: R = Read, W = Write, RW = Read+Write, — = No access

`Datenschutz` has read-only access to audit/compliance summary reports and audit trail, aligned with HR/Admin visibility for those report classes.
Team-calendar endpoints return individual absence rows even when reasons are redacted, so access must remain limited to operational team-calendar roles (`Employee`, `Team Lead`, `Shift Planner`, `HR`, `Admin`). `Payroll`, `Datenschutz`, and `Personalrat` must not receive team-calendar rows.
Person lookup endpoints are also explicitly scoped. `HR` and `Admin` may read full person records. `Team Lead` and `Shift Planner` may read only people in their own organization unit, and the response is reduced to `id`, `firstName`, `lastName`, `role`, and `organizationUnitId`.

---

## 4. Data Protection (GDPR / DSGVO)

### Data Classification

| Category             | Examples                            | Sensitivity        | Retention                                               |
| -------------------- | ----------------------------------- | ------------------ | ------------------------------------------------------- |
| Time bookings        | Clock in/out, pauses                | Personal           | Configurable (default: 3 years per labor law)           |
| Absence records      | Leave dates, sick dates             | Sensitive (health) | Configurable (default: deletion after retention period) |
| Absence reasons      | "Sick", "Special leave for wedding" | Highly sensitive   | Visible only to authorized roles; deleted with record   |
| Salary-relevant data | Surcharges, overtime hours          | Personal           | Per payroll retention requirements                      |
| Audit trail          | Who changed what                    | System/personal    | Configurable (minimum: legal retention period)          |
| Aggregated reports   | Team absence %, shift coverage      | Low                | No deletion needed (anonymized)                         |

### Data Minimization

- Collect only what is needed for the documented business purpose.
- Absence reasons: captured only if needed for processing (e.g., special leave type); never displayed beyond authorized roles.
- Reports: default to aggregated views; individual views require explicit role permission.

### Right to Access / Portability

- Employees can export their own data (bookings, balances, leave history) via self-service.
- Data export format: JSON or CSV, machine-readable.

### Right to Erasure

- Deletion follows configurable retention policies per data category.
- Audit entries are **not** deleted (legal requirement for auditability), but PII within them can be pseudonymized after the retention period.
- Deletion is logged in the audit trail (meta-entry: "records deleted per retention policy").

### DPIA (DSFA) Support

The system provides:

- Data flow documentation (which data, where, why)
- Processing register entries
- Technical and organizational measures (TOMs) documentation

---

## 5. Works Council (Personalrat) Compliance

### Constraints

- **No individual performance monitoring.** Reports must not enable tracking individual work speed, break patterns, or compliance scores.
- **Aggregation thresholds.** Reports showing absence or overtime patterns must have a minimum group size (e.g., ≥5 people) to prevent re-identification.
- **Configurable report access.** The works council can review and approve which reports are available to which roles.
- **Transparent rules.** Employees can see which rules affect them and how their balance is calculated.

### Works Council Access

The `Personalrat` role provides:

- Read access to aggregated reports (no individual data)
- Read access to audit trail (to verify system behavior)
- No access to individual bookings, balances, team-calendar rows, or absence reasons

---

## 6. Threat Model (High-Level)

| Threat                              | Impact                                     | Mitigation                                                                        |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Unauthorized access to absence data | Privacy violation; works council complaint | RBAC, API-level checks, UI-level filtering                                        |
| Audit trail tampering               | Loss of legal compliance; cover-up         | Append-only design; DB-level write restrictions; integrity checks                 |
| Terminal spoofing                   | Fraudulent bookings                        | Terminal authentication (badge/PIN); device registration; anomaly detection       |
| Credential theft                    | Unauthorized system access                 | SSO with IdP-managed MFA; short session lifetimes                                 |
| SQL injection                       | Data breach                                | Parameterized queries; ORM; input validation                                      |
| XSS                                 | Session hijacking                          | CSP headers; output encoding; framework protections; bearer tokens kept in memory |
| Insider threat (admin)              | Mass data access                           | Audit all admin actions; rotate admin credentials; principle of least privilege   |
| Data exfiltration via export        | Unauthorized payroll data access           | Export requires explicit role; logged; review by HR                               |

---

## 7. Encryption

| Layer        | Standard                                              |
| ------------ | ----------------------------------------------------- |
| In transit   | TLS 1.2+ (enforce HTTPS everywhere)                   |
| At rest      | AES-256 for database volumes (managed DB default)     |
| Backups      | Encrypted at rest; access restricted to ops role      |
| Tokens (JWT) | Signed with RS256 or EdDSA; secrets rotated regularly |

Integration tokens for terminal and HR endpoints must be rotated and delivered via secure secret injection (never committed to repo).

---

## 8. Browser Security Headers

The web frontend sets defense-in-depth headers for all routes:

- `Content-Security-Policy` includes `object-src 'none'` and `frame-ancestors 'none'`.
- Script and style execution use per-request nonces generated by the web middleware.
- Production CSP excludes `unsafe-eval`; development may allow it for Next.js tooling compatibility.
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` remain enabled.

Bearer tokens entered into the web UI are held in React state only. The frontend keeps the API base URL in `sessionStorage` for operator convenience, but it clears the legacy `cq-token` key and does not persist bearer tokens after refresh or tab close.

---

## 9. Vulnerability Reporting

If you discover a security vulnerability in cueq:

1. **Do not** open a public issue.
2. Email the security response team privately at `security@cueq.local`.
3. Include: description, reproduction steps, impact assessment.
4. We will acknowledge within 48 hours and work on a fix.

### Security Ownership

- Security mailbox: `security@cueq.local`
- Primary owner: Platform Security Owner (Admin Team)
- Backup owner: Ops On-Call Lead
- Triage SLA owner: Platform Security Owner

---

## 10. References

- [`RELIABILITY.md`](RELIABILITY.md) — Operational security (backup, monitoring, incident response)
- [`QUALITY_SCORE.md`](QUALITY_SCORE.md) — Security-related quality gates
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md) — Privacy-by-design principles
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — System architecture and integration points
