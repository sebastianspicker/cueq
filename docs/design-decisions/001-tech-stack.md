# ADR-001: Technology stack

- Status: Accepted
- Scope: Current repository implementation

## Context

cueq needs shared contracts across a browser application, HTTP API, domain
rules, database schema, and integration boundaries. The repository also needs
repeatable local and hosted checks for a privacy-sensitive workforce domain.

## Decision

Use the following stack:

| Concern           | Current choice                                                       |
| ----------------- | -------------------------------------------------------------------- |
| Workspace         | pnpm 9.15.0 workspaces and Turborepo                                 |
| Language          | TypeScript                                                           |
| API               | NestJS 11                                                            |
| Web               | Next.js 15 App Router and React 19                                   |
| Database          | PostgreSQL 16 and Prisma 6                                           |
| Validation        | Zod and JSON Schema                                                  |
| HTTP contract     | NestJS Swagger decorators and a committed OpenAPI snapshot           |
| Authentication    | `jose` with mock, OIDC, and SAML-bridge adapters                     |
| Tests             | Vitest, Playwright, axe, and Node test runner                        |
| Repository checks | ESLint, Prettier, Knip, schema validation, and contract drift checks |
| Hosted checks     | GitHub Actions and CodeQL                                            |

The workspace contains:

```text
apps/
  api/
  web/
packages/
  core/
  database/
  policy/
  shared/
```

## TypeScript toolchain

Workspace type checking and package emission use the native TypeScript package
pinned as `@typescript/native`. Framework tools that consume the TypeScript
compiler API resolve the compatibility package pinned as `typescript`.
`pnpm run toolchain:verify` checks the installed versions and resolution paths.

Node-targeted packages use `NodeNext` module resolution and explicit `.js`
relative import specifiers. The Next.js workspace uses bundler resolution.

## Authentication boundary

The OIDC adapter expects Keycloak-style role claims and a Keycloak certificate
path. The SAML selector verifies an HMAC-signed bridge JWT and does not
implement SAML. The browser accepts a bearer token manually and has no complete
SSO or refresh-session flow.

These are current limitations, not implied capabilities of the selected
frameworks.

## Consequences

- Runtime validation can be shared between packages through Zod.
- External HTTP consumers have a committed OpenAPI snapshot.
- Prisma schema changes require migrations and regeneration.
- Package build order is explicit in the Turborepo task graph.
- Decorator and schema contracts can drift, so generation and contract checks
  remain required.
- The framework choices do not provide deployment, identity administration,
  data protection, monitoring, or operational approval.

## References

- [Architecture](../../ARCHITECTURE.md)
- [Configuration](../CONFIGURATION.md)
- [Frontend](../FRONTEND.md)
- [Quality gates](../QUALITY_GATES.md)
