# ADR-001: Technology Stack Selection

> **Status:** Accepted
> **Date:** 2026-02-28
> **Deciders:** Project lead, IT department

---

## Context

cueq is a greenfield project that needs a technology stack suitable for:

1. **A university IT environment** — maintainability by a small team, standard tooling, no exotic dependencies
2. **Compliance-heavy domain** — strong type safety, schema-driven development, audit-grade data handling
3. **Multiple interfaces** — web self-service, API for terminals, export pipelines, SSO integration
4. **Long-term operation** — the system will run for 10+ years; technology choices must be stable and well-supported

## Decision

### Accepted Stack

| Concern                | Choice                               | Rationale                                                                                              |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Monorepo tooling**   | pnpm workspaces + Turborepo          | Fast installs, efficient disk usage, parallel builds, single lockfile                                  |
| **Backend framework**  | NestJS                               | TypeScript-native, modular, built-in OpenAPI/Swagger, dependency injection, proven enterprise patterns |
| **Frontend framework** | Next.js (App Router)                 | SSR/SSG flexibility, React ecosystem, excellent TypeScript support, built-in routing                   |
| **Database**           | PostgreSQL 16                        | Proven for transactional + audit workloads; university IT experience; open source                      |
| **ORM**                | Prisma                               | Type-safe schema-first ORM; migration tooling; Prisma Studio for debugging                             |
| **Validation**         | Zod                                  | Runtime validation shared across API + UI; TypeScript type inference; composable schemas               |
| **API design**         | OpenAPI via @nestjs/swagger          | Generated from decorators; Swagger UI for dev/testing; CI-verifiable spec                              |
| **Auth**               | NestJS Guards + Passport (SAML/OIDC) | Flexible; supports university IdP; role-based guards                                                   |
| **Testing**            | Vitest                               | Fast; Vite-native; modern; good TypeScript support                                                     |
| **CI**                 | GitHub Actions                       | Already in use for the repo; excellent pnpm/turborepo caching support                                  |
| **Containerization**   | Docker + docker-compose              | Standard dev setup; PostgreSQL in development; production-compatible                                   |
| **Code quality**       | ESLint + Prettier                    | Industry standard; enforced in CI                                                                      |

### Monorepo Structure

```
cueq/
├── apps/
│   ├── api/          # NestJS API server
│   └── web/          # Next.js frontend
├── packages/
│   ├── core/         # Domain core logic helpers (@cueq/core)
│   ├── database/     # Prisma schema + client
│   ├── shared/       # Zod schemas + shared types
│   └── policy/       # Policy-as-code rule definitions + golden tests
```

## Consequences

### Positive

- Single language (TypeScript) across frontend, backend, and shared packages
- Zod schemas are the single source of truth for validation — shared between NestJS DTOs and Next.js forms
- Prisma provides type-safe database access with automatic migration management
- Turborepo caching significantly speeds up CI and local builds
- NestJS modules map naturally to the domain's bounded contexts (BookingsModule, AbsenceModule, etc.)

### Negative

- NestJS decorator-heavy style has a learning curve
- Prisma has some limitations with complex queries (raw SQL escape hatch available)
- Next.js App Router is relatively new; some ecosystem libraries still catching up

### Neutral

- pnpm `workspace:*` protocol requires all packages to be built before consumers can use them (Turborepo handles ordering)
- OpenAPI spec is generated from NestJS decorators rather than spec-first; CI validation of the generated spec against a checked-in snapshot ensures contract stability

## Alternatives Considered

| Alternative                                 | Pros                                 | Cons                                                              | Why Not                                                 |
| ------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Express (instead of NestJS)                 | Simpler, lighter                     | No structure, no DI, no built-in Swagger                          | Too unstructured for a compliance-heavy domain          |
| Drizzle ORM (instead of Prisma)             | Closer to SQL, lighter               | Less mature migration tooling, smaller community                  | Prisma's schema-first approach better fits our workflow |
| tRPC (instead of REST + OpenAPI)            | End-to-end type safety               | No standard API contract for non-TS consumers (terminals, export) | Need OpenAPI for external integrations                  |
| SolidJS / Svelte (instead of React/Next.js) | Smaller bundle, simpler mental model | Smaller ecosystem, fewer a11y tools                               | React has the largest pool of available developers      |

## References

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — System architecture requirements
- [`docs/DESIGN.md`](../DESIGN.md) — Schema-first development principle
- [`docs/design-docs/core-beliefs.md`](../design-docs/core-beliefs.md) — Core beliefs
- [`docs/FRONTEND.md`](../FRONTEND.md) — Frontend architecture decisions
