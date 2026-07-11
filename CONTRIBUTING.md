# Contributing to cueq

cueq is a reference implementation for university workforce management with
strict privacy, authorization, and audit requirements. Read this before opening
a PR.

## Contributor guide

The full guide is in **[AGENTS.md](AGENTS.md)**. It covers:

- Repo structure and context loading order
- Small, reviewable change policy (one coherent concern per PR)
- Standard commands (`make check`, `make test-all`, `make quick`)
- Conventional Commits format
- Verification expectations for code, documentation, and schema changes
- Security and privacy constraints
- GDPR / works-council compliance requirements

## Quick checklist

Before opening a PR:

- [ ] `make check` passes locally
- [ ] New behavior has tests
- [ ] No secrets, PII, or telemetry added
- [ ] One concern per PR

## Reporting bugs and requesting features

Use the [issue templates](.github/ISSUE_TEMPLATE/) — they include required compliance and privacy checks.

## Security issues

Do **not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for GitHub disclosure routing and
[docs/SECURITY.md](docs/SECURITY.md#8-vulnerability-reporting) for the full
security and data-protection model.
