# ADR-005: Modular-monolith capability boundaries

- Status: Accepted
- Scope: API feature modules and workspace package dependencies

## Context

cueq runs as one deployable application but contains distinct workforce
capabilities. A shared aggregate implementation makes feature ownership and
dependency direction unclear, while splitting into independently deployed
services would add operational coupling without a demonstrated need.

## Decision

Use a modular monolith. API capabilities live in `apps/api/src/modules/` as
`audit`, `people`, `session`, `attendance`, `absence`, `scheduling`,
`workflows`, `closing`, `policy`, `reporting`, and `integrations`.

Feature internals are private and cross-feature imports use explicit
`public.ts` surfaces. Cross-feature aggregate mutations use narrow application
ports implemented by the owning capability. `workflows` and `closing`
coordinate those ports; `reporting` and `integrations` adapt external
boundaries.

Workflow runtime and workflow decision orchestration are separate Nest module
boundaries. Absence and closing may depend on runtime assignment/query
capabilities; the decisions module may depend on feature-owned effect ports.
This direction avoids a bidirectional feature-module dependency.

Workspace dependencies point inward: contracts and policy depend only on Zod;
domain depends on policy and stays pure; database owns Prisma; API and web are
edge consumers.

## Consequences

- Features can be understood, tested, and changed without deep imports into
  another feature.
- Pure domain behavior remains independent of NestJS, Prisma, browser, HTTP,
  and filesystem APIs.
- A future service split must start from explicit ports and operational need,
  not directory naming alone.

## References

- [Architecture](../../ARCHITECTURE.md)
