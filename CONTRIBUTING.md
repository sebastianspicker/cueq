# Contributing to cueq

cueq is an internal university workforce-management system with strict legal, privacy, and compliance requirements. Read this before opening a PR.

## Contributor guide

The full guide is in **[AGENTS.md](AGENTS.md)**. It covers:

- Repo structure and context loading order
- Small, reviewable change policy (one concern per PR, max 400 lines)
- Standard commands (`make check`, `make test-all`, `make quick`)
- Conventional Commits format
- Definition of Done (code, documentation, schema changes)
- Security and privacy constraints (non-negotiable hard rules)
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

Do **not** open a public issue for security vulnerabilities. See [docs/SECURITY.md](docs/SECURITY.md#8-vulnerability-reporting) for the responsible disclosure process.
