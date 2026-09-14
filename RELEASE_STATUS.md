# Release status

No public release candidate is currently designated.

cueq is available as pre-release source for local evaluation with synthetic
data. Workspace packages are private at version `0.0.0`. There is no published
npm package, application image, hosted cueq instance, or production support
offering.

The GitHub Pages workflow builds and publishes a static interactive demo from
deterministic browser data. The demo has no API or database connection and is
not a cueq deployment.

## Designating a candidate

Follow the complete checklist in [docs/RELEASING.md](docs/RELEASING.md). When a
candidate is chosen, record its exact commit or tag, the verification date and
environment, every command and hosted check result, and any check that failed or
could not run. A failed or unavailable required check keeps the candidate in
draft status.

## Known limits

- The browser has no complete SSO redirect, refresh-token, or session lifecycle.
- Retention, erasure, personal-data export, and pseudonymization are not
  automated.
- Machine integrations use shared tokens and do not provide physical device
  controls.
- Audit rows reject updates and deletes, but the audit trail is not
  cryptographically tamper-evident and does not prevent `TRUNCATE`.
- The repository does not provide packaged deployment, metrics, alerts, traces,
  or log shipping.
- A release does not establish legal, security, accessibility, data-protection,
  works-council, payroll-provider, or operational approval.

See [docs/RELEASING.md](docs/RELEASING.md) for the publication process.
