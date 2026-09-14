# ADR-005: Use modular-monolith boundaries

- Status: Accepted
- Scope: API features and workspace package dependencies

## Context

cueq has separate web and API processes but remains one application backed by a
shared database. Its attendance, absence, scheduling, workflow, closing,
reporting, and HR features need clear ownership. A single collection of shared
services would obscure that ownership. Splitting the same features into
separately deployed services would add network and operational coordination
without a demonstrated need.

## Decision

Keep the application as a modular monolith. API features live under
`apps/api/src/modules`:

```text
absence       attendance    audit          closing       documents
integrations  lifecycle     people         policy        projects
reporting     scheduling    session        workflows
```

Each feature keeps its internals private and exposes deliberate cross-feature
APIs through `public.ts`. A feature that needs to change records owned elsewhere
uses an application port implemented by the owning feature.

The workflows feature coordinates decisions through these ports. Absence and
closing may use the narrower `workflow-runtime.public.ts` surface for workflow
assignments and queries. Reporting and integrations adapt outward-facing reads
and protocols without taking ownership of the underlying records. These rules
keep the NestJS module graph acyclic.

Workspace dependencies also point inward: contracts and policy depend only on
Zod, domain depends on policy and stays free of runtime frameworks, database
owns Prisma, and the API and web applications consume the shared packages.

## Consequences

- Contributors can locate a behavior and its data owner without following deep
  imports across features.
- Pure domain code remains independent of NestJS, Prisma, HTTP, browser, and
  filesystem APIs.
- Cross-feature changes may require a small public interface or application
  port instead of a direct call.
- A future service split should begin with an operational requirement and the
  existing explicit boundary, not the directory structure alone.

## Alternatives considered

A broadly shared application layer would require fewer interfaces initially,
but would make ownership and dependency cycles difficult to control. Separate
services would create stronger runtime isolation, but also require distributed
transactions, service deployment, and network failure handling that the current
system does not need.

## References

- [Architecture](../../ARCHITECTURE.md)
- [`scripts/check-architecture.mjs`](../../scripts/check-architecture.mjs)
