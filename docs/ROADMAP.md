# Roadmap

This roadmap describes the work needed to assess cueq for a future production
candidate. It is not a release schedule or a promise of delivery.

## Alpha: local source evaluation

Current scope: synthetic-data development and evaluation of the implemented
domain, API, web, integration, and operations capability families.

Exit evidence: a reproducible local setup, source checks, and clearly stated
boundaries. This does not authorize real-data or production use.

The public source-alpha process and proposed `v0.1.0-alpha.N` tag policy are
defined in [RELEASING.md](RELEASING.md). A tag is not cut while any required
dependency, browser, database, privacy-review, or hosted gate remains open.

## Production-assessment prerequisites

1. Candidate verification: freeze a candidate commit and pass `make check`
   in an authorized environment with PostgreSQL; verify generated contracts
   and hosted CI on that exact commit.
2. Identity and authorization: validate production-grade identity,
   session, role, and privacy behavior with the institution's approved identity
   provider and least-privilege review.
3. Data and operations: rehearse migrations, backup/restore, monitoring,
   failure handling, retention, and recovery with disposable service-backed
   infrastructure.
4. Integrations and exports: validate terminal, HR, webhook, and payroll
   interfaces against approved non-production endpoints, including failure and
   idempotency cases.
5. Institutional approval: obtain the relevant legal, privacy, security,
   accessibility, and works-council decisions before handling real data.

No milestone is complete merely because source code exists. Completion requires
the corresponding deterministic evidence and owner approval.
