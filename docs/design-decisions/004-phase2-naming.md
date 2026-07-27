# ADR-004: API `phase2` directory

- Status: Accepted
- Scope: `apps/api/src/phase2/`

## Context

`apps/api/src/phase2/` contains the current controllers, services, helpers, and
scheduled work for time, absence, roster, on-call, workflow, closing, reporting,
terminal, HR, and webhook domains.

The directory name does not describe a domain, but it is part of the current
source structure and import graph.

## Decision

Keep the directory name until a dedicated domain split is justified by a
concrete ownership or dependency problem.

Within the current directory:

- controllers own HTTP transport and route policy;
- domain services own transaction and workflow orchestration;
- helpers isolate a coherent sub-domain operation;
- reusable I/O-free rules belong in `packages/core` or `packages/policy`; and
- cross-layer schemas belong in `packages/shared`.

Do not create a competing top-level API structure for the same domains.

## Consequences

- Documentation must identify the domains inside `phase2` instead of treating
  the directory name as product terminology.
- A future move must update imports, tests, OpenAPI generation, and architecture
  documentation in one reviewed change.
- Directory reorganization is not required for feature work that fits the
  current boundaries.

## References

- [Architecture](../../ARCHITECTURE.md)
