# Release status

Status: no public release candidate is currently designated.

The repository is a source alpha for local evaluation with synthetic data. The
workspace packages remain private at version `0.0.0`; public release identity
would use a prerelease Git tag.

## Current boundary

No candidate commit or tag is designated. Local checks can guide development,
but they do not establish release readiness until they are run against the
exact reviewed candidate revision.

No hosted application deployment, npm package, application container image, or
production support offering is part of the current release scope. The GitHub
Pages workflow publishes only the sanitized static walkthrough.

## Required candidate evidence

Before designating a candidate:

1. review the complete diff and confirm that only intended source,
   configuration, migration, contract, asset, and documentation files
   are included;
2. confirm that all screenshots contain synthetic data;
3. install the frozen dependency graph with Node.js 20.19.0 and pnpm 11.24.0;
4. run `make generate` and verify that committed derived artifacts are current;
5. run `make check` and `make build` with PostgreSQL available;
6. review all six tracked screenshots;
7. run CI, dependency review, and CodeQL on the exact candidate commit;
8. verify the rendered GitHub documentation and source archive.

Any failed or unavailable gate keeps the candidate in draft status. Record
evidence against the exact commit, command, environment, and date.

## Accepted alpha limitations

- no complete browser SSO, refresh-token, or session lifecycle;
- no automated retention, erasure, personal-data export, or pseudonymization;
- shared-token machine integrations without physical device controls;
- audit protection against row updates and deletes without cryptographic
  tamper evidence or `TRUNCATE` protection;
- no packaged deployment, metrics, alert delivery, tracing, or log shipping;
  and
- no legal, security, accessibility, data-protection, works-council, or
  operational approval.

The release checklist is in [docs/RELEASING.md](docs/RELEASING.md).
